export type UserRole = 'owner' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export type IntakeStatus = 'New' | 'In Process' | 'Scheduled' | 'Completed';

export interface ContactAttempt {
  id: string;
  timestamp: string; // ISO string
  method: 'call' | 'text' | 'email' | 'combination';
  outcome: 'talked_to_them' | 'left_voicemail' | 'sent_text' | 'sent_email_toolkit' | 'no_answer' | 'other';
  notes: string;
  loggedBy?: string;
}

export interface IntakeRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  lastEditedBy: string;

  // External sync
  externalEventId?: string | null;

  // Contact Info
  contactName: string;
  contactFirstName?: string | null;
  contactLastName?: string | null;
  contactEmail: string;
  contactPhone: string;
  preferredContactMethod?: string | null;

  // Backup Contact
  backupContactFirstName?: string | null;
  backupContactLastName?: string | null;
  backupContactEmail?: string | null;
  backupContactPhone?: string | null;
  backupContactRole?: string | null;

  // Organization
  organizationName: string;
  organizationCategory?: string | null;
  department?: string | null;

  // Event Details
  eventDate: string;
  desiredEventDate?: string | null;
  scheduledEventDate?: string | null;
  dateFlexible?: boolean | null;
  eventTime: string;
  eventStartTime?: string | null;
  eventEndTime?: string | null;
  location: string;
  eventAddress?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  attendeeCount: number;
  volunteerCount?: number | null;
  message?: string | null;

  // Sandwich Details
  sandwichCount: number;
  actualSandwichCount?: number | null;
  sandwichType?: string | null;
  dietaryRestrictions: string;
  requiresRefrigeration: boolean;

  // Logistics
  hasIndoorSpace: boolean;
  hasRefrigeration: boolean;
  refrigerationConfirmed: boolean;
  pickupTimeWindow?: string | null;
  deliveryInstructions: string;

  // Status & Assignment
  status: IntakeStatus;
  ownerId: string | null;
  tspContactAssigned?: string | null;
  tspContact?: string | null;
  customTspContact?: string | null;

  // Notes & Tracking
  planningNotes?: string | null;
  schedulingNotes?: string | null;
  nextAction?: string | null;
  contactAttempts?: number | null;
  contactAttemptsLog?: ContactAttempt[] | null;

  // Flags
  flags: string[];

  // Intake Workflow Checklist
  intakeChecklist?: Record<string, boolean> | null;

  // Notes
  internalNotes: string;
}

export interface Task {
  id: string;
  intakeId: string;
  title: string;
  dueDate: string;
  completed: boolean;
  completedAt?: string;
  type: 'follow_up' | 'pre_event' | 'reminder' | 'post_event';
}

// --- Intake Checklist Definitions ---

export interface ChecklistItemDef {
  key: string;
  label: string;
  group: 'event_details' | 'food_safety' | 'preparation' | 'packaging' | 'follow_up';
  derivedFrom?: (record: IntakeRecord) => boolean;
}

export const CHECKLIST_ITEMS: ChecklistItemDef[] = [
  // Event Details (auto-derived from form fields)
  { key: 'event_address', label: 'Event address (where sandwiches will be made)', group: 'event_details', derivedFrom: (r) => !!(r.eventAddress || r.location) },
  { key: 'event_date', label: 'Event date', group: 'event_details', derivedFrom: (r) => !!r.eventDate },
  { key: 'event_time', label: 'Event time (start and end)', group: 'event_details', derivedFrom: (r) => !!(r.eventStartTime && r.eventEndTime) },
  { key: 'refrigeration', label: 'Refrigeration confirmed with contact (access, space, education on handling)', group: 'event_details', derivedFrom: (r) => !!r.refrigerationConfirmed },
  { key: 'sandwich_type', label: 'Sandwich type specified (turkey, ham, chicken, or PBJ)', group: 'event_details', derivedFrom: (r) => !!r.sandwichType },
  { key: 'sandwich_count', label: 'Sandwich count confirmed', group: 'event_details', derivedFrom: (r) => r.sandwichCount > 0 },

  // Food Safety & Purchasing (confirmation items)
  { key: 'inventory_calculator', label: 'Walked through inventory calculator & helped budget shopping trip', group: 'food_safety' },
  { key: 'one_buyer_rule', label: 'All meat must be purchased by ONE individual, not split', group: 'food_safety' },
  { key: 'cheese_type', label: 'Cheese: individually wrapped Kraft-type American only — no deli counter', group: 'food_safety' },
  { key: 'prepackaged_only', label: 'Prepackaged meats & cheeses ONLY — nothing sliced at the counter', group: 'food_safety' },
  { key: 'meat_type', label: 'Turkey or chicken only — no ham (minimal exceptions)', group: 'food_safety' },
  { key: 'bread_choice', label: "Bread: group's choice, any white/wheat works", group: 'food_safety' },

  // Preparation Rules (confirmation items)
  { key: 'assembly_method', label: 'Assembly: 2 pieces of cheese with meat IN BETWEEN', group: 'preparation' },
  { key: 'meat_portions', label: 'Meat portions: use serving size on package (2-3 slices)', group: 'preparation' },
  { key: 'hairnets', label: 'Hairnets required during sandwich making', group: 'preparation' },
  { key: 'gloves', label: 'Food-safe gloves required', group: 'preparation' },
  { key: 'hand_washing', label: 'Hand washing: soap & water ONLY — NOT hand sanitizer', group: 'preparation' },
  { key: 'clean_surfaces', label: 'Clean all surfaces before starting prep', group: 'preparation' },
  { key: 'batch_ingredients', label: 'Batch ingredients — meat & cheese spend minimal time outside fridge', group: 'preparation' },

  // Packaging & Transport (confirmation items)
  { key: 'bag_individually', label: 'Bag each sandwich in sandwich-size Ziploc bags', group: 'packaging' },
  { key: 'bread_bag_reuse', label: 'Stack bagged sandwiches in bread bags — save bags & twist ties (buy extras)', group: 'packaging' },
  { key: 'tsp_labels', label: 'TSP labels on bread bags: date, meat type, # of sandwiches', group: 'packaging' },
  { key: 'refrigerate_before_transport', label: 'Bags into fridge to cool before going into cooler', group: 'packaging' },
  { key: 'cooler_transport', label: 'Transport in cooler with ice packs', group: 'packaging' },

  // Follow-up
  { key: 'photo_instructions', label: 'Photos to photos@thesandwichproject.org — include names/Instagram handles for tagging', group: 'follow_up' },
];

export const CHECKLIST_GROUP_LABELS: Record<string, string> = {
  event_details: 'Event Details',
  food_safety: 'Food Safety & Purchasing',
  preparation: 'Preparation Rules',
  packaging: 'Packaging & Transport',
  follow_up: 'Follow-up',
};

// Initial seed data for the store
export const MOCK_USERS: User[] = [
  { id: 'u1', email: 'owner@tsp.org', name: 'Intake Owner', role: 'owner' },
  { id: 'u2', email: 'admin@tsp.org', name: 'Admin User', role: 'admin' },
];
