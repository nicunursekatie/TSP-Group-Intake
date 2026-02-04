import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(), // 'owner' | 'admin'
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const intakeRecords = pgTable("intake_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  lastEditedBy: varchar("last_edited_by").references(() => users.id),
  
  // External sync
  externalEventId: text("external_event_id"),
  
  // Basic Info
  organizationName: text("organization_name").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  
  // Event Details
  eventDate: timestamp("event_date"),
  eventTime: text("event_time"),
  location: text("location"),
  attendeeCount: integer("attendee_count").notNull().default(0),
  
  // Sandwich Details
  sandwichCount: integer("sandwich_count").notNull().default(0),
  dietaryRestrictions: text("dietary_restrictions"),
  requiresRefrigeration: boolean("requires_refrigeration").notNull().default(false),
  
  // Logistics
  hasIndoorSpace: boolean("has_indoor_space").notNull().default(true),
  hasRefrigeration: boolean("has_refrigeration").notNull().default(false),
  deliveryInstructions: text("delivery_instructions"),
  
  // Status & Assignment
  status: text("status").notNull().default('New'),
  ownerId: varchar("owner_id").references(() => users.id),
  
  // Flags
  flags: jsonb("flags").$type<string[]>().notNull().default([]),
  
  // Notes
  internalNotes: text("internal_notes"),
});

export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  intakeId: varchar("intake_id").references(() => intakeRecords.id, { onDelete: 'cascade' }).notNull(),
  title: text("title").notNull(),
  dueDate: timestamp("due_date").notNull(),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  type: text("type").notNull(), // 'follow_up' | 'pre_event' | 'reminder' | 'post_event'
});

export const platformSyncLog = pgTable("platform_sync_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
  direction: text("direction").notNull(), // 'pull' | 'push'
  recordCount: integer("record_count").notNull(),
  status: text("status").notNull(), // 'success' | 'error'
  error: text("error"),
});

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertIntakeRecordSchema = createInsertSchema(intakeRecords, {
  eventDate: z.union([z.string(), z.date()]).optional().nullable().transform(val => {
    if (!val) return null;
    return typeof val === 'string' ? new Date(val) : val;
  }),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateIntakeRecordSchema = insertIntakeRecordSchema.partial();

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type IntakeRecord = typeof intakeRecords.$inferSelect;
export type InsertIntakeRecord = z.infer<typeof insertIntakeRecordSchema>;
export type UpdateIntakeRecord = z.infer<typeof updateIntakeRecordSchema>;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type PlatformSyncLog = typeof platformSyncLog.$inferSelect;
