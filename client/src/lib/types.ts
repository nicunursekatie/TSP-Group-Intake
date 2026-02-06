export type UserRole = 'owner' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export type IntakeStatus = 'New' | 'In Process' | 'Scheduled' | 'Completed';

export interface IntakeRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  lastEditedBy: string; // User ID

  // External sync
  externalEventId?: string | null;

  // Contact Info
  contactName: string;
  contactFirstName?: string | null;
  contactLastName?: string | null;
  contactEmail: string;
  contactPhone: string;

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
  eventDate: string; // ISO String
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
  dietaryRestrictions: string;
  requiresRefrigeration: boolean;

  // Logistics
  hasIndoorSpace: boolean;
  hasRefrigeration: boolean;
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
  contactAttemptsLog?: any[] | null;

  // Flags (Calculated or Manual)
  flags: string[]; // e.g., "High Volume", "No Indoor Space"

  // Notes
  internalNotes: string;
}

export interface Task {
  id: string;
  intakeId: string;
  title: string;
  dueDate: string; // ISO String
  completed: boolean;
  completedAt?: string;
  type: 'follow_up' | 'pre_event' | 'reminder' | 'post_event';
}

// Initial seed data for the store
export const MOCK_USERS: User[] = [
  { id: 'u1', email: 'owner@tsp.org', name: 'Intake Owner', role: 'owner' },
  { id: 'u2', email: 'admin@tsp.org', name: 'Admin User', role: 'admin' },
];
