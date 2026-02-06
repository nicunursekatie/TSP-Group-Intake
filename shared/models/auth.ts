import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar, text } from "drizzle-orm/pg-core";

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

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: text("role").notNull().default('pending'), // 'pending' | 'intake_team' | 'admin'
  approvalStatus: text("approval_status").notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  phoneNumber: varchar("phone_number"),
  platformUserId: varchar("platform_user_id"),
  smsAlertsEnabled: text("sms_alerts_enabled").notNull().default('false'),
  emailNotificationsEnabled: text("email_notifications_enabled").notNull().default('true'),
  notifyOnNewIntake: text("notify_on_new_intake").notNull().default('true'),
  notifyOnTaskDue: text("notify_on_task_due").notNull().default('true'),
  notifyOnStatusChange: text("notify_on_status_change").notNull().default('false'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
