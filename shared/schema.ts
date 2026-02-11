import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Re-export auth models (users and sessions tables)
export * from "./models/auth";
import { users } from "./models/auth";

export const intakeRecords = pgTable("intake_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  lastEditedBy: varchar("last_edited_by").references(() => users.id),

  // External sync
  externalEventId: text("external_event_id"),

  // Contact Info
  contactName: text("contact_name").notNull(),
  contactFirstName: text("contact_first_name"),
  contactLastName: text("contact_last_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  preferredContactMethod: text("preferred_contact_method"), // 'call' | 'text' | 'email'

  // Backup Contact
  backupContactFirstName: text("backup_contact_first_name"),
  backupContactLastName: text("backup_contact_last_name"),
  backupContactEmail: text("backup_contact_email"),
  backupContactPhone: text("backup_contact_phone"),
  backupContactRole: text("backup_contact_role"),

  // Organization
  organizationName: text("organization_name").notNull(),
  organizationCategory: text("organization_category"),
  department: text("department"),

  // Event Details
  eventDate: timestamp("event_date"),
  desiredEventDate: timestamp("desired_event_date"),
  scheduledEventDate: timestamp("scheduled_event_date"),
  dateFlexible: boolean("date_flexible"),
  eventTime: text("event_time"),
  eventStartTime: text("event_start_time"),
  eventEndTime: text("event_end_time"),
  location: text("location"),
  eventAddress: text("event_address"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  attendeeCount: integer("attendee_count").notNull().default(0),
  volunteerCount: integer("volunteer_count"),
  message: text("message"),

  // Sandwich Details
  sandwichCount: integer("sandwich_count").notNull().default(0),
  actualSandwichCount: integer("actual_sandwich_count"),
  sandwichType: text("sandwich_type"), // 'turkey' | 'chicken' | 'pbj'
  dietaryRestrictions: text("dietary_restrictions"),
  requiresRefrigeration: boolean("requires_refrigeration").notNull().default(false),

  // Logistics
  hasIndoorSpace: boolean("has_indoor_space").notNull().default(true),
  hasRefrigeration: boolean("has_refrigeration").notNull().default(false),
  refrigerationConfirmed: boolean("refrigeration_confirmed").notNull().default(false),
  pickupTimeWindow: text("pickup_time_window"),
  nextDayPickup: boolean("next_day_pickup").notNull().default(false),
  deliveryInstructions: text("delivery_instructions"),

  // Status & Assignment
  status: text("status").notNull().default('New'),
  ownerId: varchar("owner_id").references(() => users.id),
  tspContactAssigned: text("tsp_contact_assigned"),
  tspContact: text("tsp_contact"),
  customTspContact: text("custom_tsp_contact"),

  // Notes & Tracking
  planningNotes: text("planning_notes"),
  schedulingNotes: text("scheduling_notes"),
  nextAction: text("next_action"),
  contactAttempts: integer("contact_attempts"),
  contactAttemptsLog: jsonb("contact_attempts_log").$type<any[]>(),

  // Flags
  flags: jsonb("flags").$type<string[]>().notNull().default([]),

  // Intake Workflow Checklist
  intakeChecklist: jsonb("intake_checklist").$type<Record<string, boolean>>().notNull().default({}),

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
export const insertIntakeRecordSchema = createInsertSchema(intakeRecords, {
  eventDate: z.union([z.string(), z.date()]).optional().nullable().transform(val => {
    if (!val) return null;
    return typeof val === 'string' ? new Date(val) : val;
  }),
  desiredEventDate: z.union([z.string(), z.date()]).optional().nullable().transform(val => {
    if (!val) return null;
    return typeof val === 'string' ? new Date(val) : val;
  }),
  scheduledEventDate: z.union([z.string(), z.date()]).optional().nullable().transform(val => {
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
export type IntakeRecord = typeof intakeRecords.$inferSelect;
export type InsertIntakeRecord = z.infer<typeof insertIntakeRecordSchema>;
export type UpdateIntakeRecord = z.infer<typeof updateIntakeRecordSchema>;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type PlatformSyncLog = typeof platformSyncLog.$inferSelect;
