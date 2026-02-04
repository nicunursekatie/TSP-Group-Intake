import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq, count } from "drizzle-orm";

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

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Check if this user already exists
    const existingUser = await this.getUser(userData.id!);
    if (existingUser) {
      // Update existing user (keep role and approval status)
      const [user] = await db
        .update(users)
        .set({
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userData.id!))
        .returning();
      return user;
    }

    // Check if this is the first user - make them admin and auto-approve
    const [{ userCount }] = await db.select({ userCount: count() }).from(users);
    const isFirstUser = userCount === 0;

    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        role: isFirstUser ? 'admin' : 'pending',
        approvalStatus: isFirstUser ? 'approved' : 'pending',
      })
      .returning();
    
    if (isFirstUser) {
      console.log(`First user ${userData.email} auto-approved as admin`);
    }
    
    return user;
  }
}

export const authStorage = new AuthStorage();
