export type UserRole = 'owner' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export type IntakeStatus = 'New' | 'Call Scheduled' | 'Call Complete' | 'Pre-Event Confirmed' | 'Completed';

export interface IntakeRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  lastEditedBy: string; // User ID
  
  // Basic Info
  organizationName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  
  // Event Details
  eventDate: string; // ISO String
  eventTime: string;
  location: string;
  attendeeCount: number;
  
  // Sandwich Details
  sandwichCount: number;
  dietaryRestrictions: string;
  requiresRefrigeration: boolean;
  
  // Logistics
  hasIndoorSpace: boolean;
  hasRefrigeration: boolean;
  deliveryInstructions: string;
  
  // Status & Assignment
  status: IntakeStatus;
  ownerId: string | null;
  
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
