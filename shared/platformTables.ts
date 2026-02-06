/**
 * Platform-owned tables — for direct DB queries only.
 *
 * NOT exported from schema.ts, so drizzle-kit push/generate will NOT
 * attempt to create, alter, or drop these tables.  The main TSP platform
 * owns them; we just read/write via the shared Neon database.
 */

import { pgTable, serial, varchar, text, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";

export const eventRequests = pgTable("event_requests", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  email: varchar("email"),
  phone: varchar("phone"),
  organizationName: varchar("organization_name"),
  organizationCategory: varchar("organization_category"),
  department: varchar("department"),
  desiredEventDate: timestamp("desired_event_date"),
  scheduledEventDate: timestamp("scheduled_event_date"),
  dateFlexible: boolean("date_flexible"),
  estimatedSandwichCount: integer("estimated_sandwich_count"),
  volunteerCount: integer("volunteer_count"),
  eventAddress: text("event_address"),
  latitude: varchar("latitude"),
  longitude: varchar("longitude"),
  eventStartTime: varchar("event_start_time"),
  eventEndTime: varchar("event_end_time"),
  message: text("message"),
  status: varchar("status"),
  tspContactAssigned: varchar("tsp_contact_assigned"),
  tspContact: varchar("tsp_contact"),
  customTspContact: text("custom_tsp_contact"),
  hasRefrigeration: boolean("has_refrigeration"),
  pickupTimeWindow: text("pickup_time_window"),
  planningNotes: text("planning_notes"),
  schedulingNotes: text("scheduling_notes"),
  backupContactFirstName: varchar("backup_contact_first_name"),
  backupContactLastName: varchar("backup_contact_last_name"),
  backupContactEmail: varchar("backup_contact_email"),
  backupContactPhone: varchar("backup_contact_phone"),
  backupContactRole: varchar("backup_contact_role"),
  nextAction: text("next_action"),
  contactAttempts: integer("contact_attempts"),
  contactAttemptsLog: jsonb("contact_attempts_log"),
  actualSandwichCount: integer("actual_sandwich_count"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});
