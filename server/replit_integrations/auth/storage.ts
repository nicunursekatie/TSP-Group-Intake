import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  // Also look up by email (for users that exist on the main platform)
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Check if this user already exists by ID
    const existingUser = userData.id ? await this.getUser(userData.id) : null;

    // Also check by email — user may exist on the main platform with a different ID
    const existingByEmail = !existingUser && userData.email
      ? await this.getUserByEmail(userData.email)
      : null;

    if (existingUser || existingByEmail) {
      const existing = (existingUser || existingByEmail)!;
      // Update profile fields only — preserve role, approval, and all platform fields
      const updates: Partial<UpsertUser> = {
        updatedAt: new Date(),
      };
      // Only update profile fields if provided by auth
      if (userData.firstName) updates.firstName = userData.firstName;
      if (userData.lastName) updates.lastName = userData.lastName;
      if (userData.profileImageUrl) updates.profileImageUrl = userData.profileImageUrl;

      // If user exists on platform but has no approval status yet, set intake defaults
      if (!existing.approvalStatus || existing.approvalStatus === 'pending') {
        // Platform admins get auto-approved on the intake app
        if (existing.role === 'admin' || existing.role === 'admin_coordinator' || existing.role === 'super_admin') {
          updates.approvalStatus = 'approved';
        }
      }

      const [user] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, existing.id))
        .returning();
      return user;
    }

    // New user — insert with intake defaults
    // Only set intake-specific fields, don't clobber platform defaults
    const [user] = await db
      .insert(users)
      .values({
        id: userData.id,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        profileImageUrl: userData.profileImageUrl,
        role: 'pending',
        approvalStatus: 'pending',
      })
      .returning();

    return user;
  }
}

export const authStorage = new AuthStorage();
