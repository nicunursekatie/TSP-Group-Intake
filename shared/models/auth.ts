import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar, text, boolean } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table — shared with the main platform's Neon database.
// Includes columns from BOTH apps so drizzle-kit push won't drop platform columns.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  phoneNumber: varchar("phone_number"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),

  // --- Main platform columns (preserve so push doesn't drop them) ---
  password: varchar("password"),
  displayName: varchar("display_name"),
  preferredEmail: varchar("preferred_email"),
  role: varchar("role").notNull().default('volunteer'),
  permissions: jsonb("permissions").default([]),
  permissionsModifiedAt: timestamp("permissions_modified_at"),
  permissionsModifiedBy: varchar("permissions_modified_by"),
  metadata: jsonb("metadata").default({}),
  isActive: boolean("is_active").notNull().default(true),
  needsPasswordSetup: boolean("needs_password_setup").default(false),
  lastLoginAt: timestamp("last_login_at"),
  lastActiveAt: timestamp("last_active_at"),
  passwordBackup20241023: text("password_backup_20241023"),

  // --- Intake app columns ---
  approvalStatus: text("approval_status").notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  platformUserId: varchar("platform_user_id"),
  smsAlertsEnabled: text("sms_alerts_enabled").notNull().default('false'),
  emailNotificationsEnabled: text("email_notifications_enabled").notNull().default('true'),
  notifyOnNewIntake: text("notify_on_new_intake").notNull().default('true'),
  notifyOnTaskDue: text("notify_on_task_due").notNull().default('true'),
  notifyOnStatusChange: text("notify_on_status_change").notNull().default('false'),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
