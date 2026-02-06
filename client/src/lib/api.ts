import type { IntakeRecord, Task, User } from "./types";

const API_BASE = "/api";

export const api = {
  // Auth
  async login(email: string): Promise<User> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error("Login failed");
    return res.json();
  },

  // Intake Records
  async getIntakeRecords(): Promise<IntakeRecord[]> {
    const res = await fetch(`${API_BASE}/intake-records`);
    if (!res.ok) throw new Error("Failed to fetch records");
    return res.json();
  },

  async getIntakeRecord(id: string): Promise<IntakeRecord> {
    const res = await fetch(`${API_BASE}/intake-records/${id}`);
    if (!res.ok) throw new Error("Failed to fetch record");
    return res.json();
  },

  async createIntakeRecord(data: Partial<IntakeRecord>): Promise<IntakeRecord> {
    const res = await fetch(`${API_BASE}/intake-records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to create record");
    return res.json();
  },

  async updateIntakeRecord(id: string, data: Partial<IntakeRecord>): Promise<IntakeRecord> {
    const res = await fetch(`${API_BASE}/intake-records/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update record");
    return res.json();
  },

  async deleteIntakeRecord(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/intake-records/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete record");
  },

  // Tasks
  async getTasksForIntake(intakeId: string): Promise<Task[]> {
    const res = await fetch(`${API_BASE}/intake-records/${intakeId}/tasks`);
    if (!res.ok) throw new Error("Failed to fetch tasks");
    return res.json();
  },

  async updateTask(id: string, data: Partial<Task>): Promise<Task> {
    const res = await fetch(`${API_BASE}/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update task");
    return res.json();
  },

  // Sync
  async syncFromPlatform(): Promise<{ imported: number; updated: number; total: number; message: string }> {
    const res = await fetch(`${API_BASE}/sync/pull`, {
      method: "POST",
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Sync failed");
    }
    return res.json();
  },

  async pushToPlatform(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/sync/push/${id}`, {
      method: "POST",
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Push sync failed");
    }
    return res.json();
  },

  async getSyncLogs(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/sync/logs`);
    if (!res.ok) throw new Error("Failed to fetch sync logs");
    return res.json();
  },
};
