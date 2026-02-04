import { db } from "./db";
import { users, intakeRecords, tasks, platformSyncLog } from "@shared/schema";
import type { 
  User, 
  InsertUser, 
  IntakeRecord, 
  InsertIntakeRecord, 
  UpdateIntakeRecord,
  Task,
  InsertTask,
  PlatformSyncLog
} from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  listUsers(): Promise<User[]>;
  
  // Intake Records
  getIntakeRecord(id: string): Promise<IntakeRecord | undefined>;
  listIntakeRecords(): Promise<IntakeRecord[]>;
  createIntakeRecord(record: InsertIntakeRecord): Promise<IntakeRecord>;
  updateIntakeRecord(id: string, updates: UpdateIntakeRecord): Promise<IntakeRecord | undefined>;
  deleteIntakeRecord(id: string): Promise<void>;
  
  // Tasks
  getTasksForIntake(intakeId: string): Promise<Task[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task | undefined>;
  deleteTasksForIntake(intakeId: string): Promise<void>;
  
  // Sync Log
  createSyncLog(log: Omit<PlatformSyncLog, 'id' | 'syncedAt'>): Promise<PlatformSyncLog>;
  getRecentSyncLogs(limit?: number): Promise<PlatformSyncLog[]>;
}

export class DbStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }

  async listUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  // Intake Records
  async getIntakeRecord(id: string): Promise<IntakeRecord | undefined> {
    const result = await db.select().from(intakeRecords).where(eq(intakeRecords.id, id)).limit(1);
    return result[0];
  }

  async listIntakeRecords(): Promise<IntakeRecord[]> {
    return db.select().from(intakeRecords).orderBy(desc(intakeRecords.createdAt));
  }

  async createIntakeRecord(record: InsertIntakeRecord): Promise<IntakeRecord> {
    const result = await db.insert(intakeRecords).values(record).returning();
    return result[0];
  }

  async updateIntakeRecord(id: string, updates: UpdateIntakeRecord): Promise<IntakeRecord | undefined> {
    const result = await db.update(intakeRecords)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(intakeRecords.id, id))
      .returning();
    return result[0];
  }

  async deleteIntakeRecord(id: string): Promise<void> {
    await db.delete(intakeRecords).where(eq(intakeRecords.id, id));
  }

  // Tasks
  async getTasksForIntake(intakeId: string): Promise<Task[]> {
    return db.select().from(tasks).where(eq(tasks.intakeId, intakeId));
  }

  async createTask(task: InsertTask): Promise<Task> {
    const result = await db.insert(tasks).values(task).returning();
    return result[0];
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | undefined> {
    const result = await db.update(tasks)
      .set(updates)
      .where(eq(tasks.id, id))
      .returning();
    return result[0];
  }

  async deleteTasksForIntake(intakeId: string): Promise<void> {
    await db.delete(tasks).where(eq(tasks.intakeId, intakeId));
  }

  // Sync Log
  async createSyncLog(log: Omit<PlatformSyncLog, 'id' | 'syncedAt'>): Promise<PlatformSyncLog> {
    const result = await db.insert(platformSyncLog).values(log).returning();
    return result[0];
  }

  async getRecentSyncLogs(limit: number = 10): Promise<PlatformSyncLog[]> {
    return db.select().from(platformSyncLog).orderBy(desc(platformSyncLog.syncedAt)).limit(limit);
  }
}

export const storage = new DbStorage();
