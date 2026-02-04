import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertIntakeRecordSchema, updateIntakeRecordSchema, insertTaskSchema } from "@shared/schema";
import { addDays, subDays } from "date-fns";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Auth / Users
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email } = req.body;
      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/users", async (req, res) => {
    try {
      const users = await storage.listUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Intake Records
  app.get("/api/intake-records", async (req, res) => {
    try {
      const records = await storage.listIntakeRecords();
      res.json(records);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch records" });
    }
  });

  app.get("/api/intake-records/:id", async (req, res) => {
    try {
      const record = await storage.getIntakeRecord(req.params.id);
      if (!record) {
        return res.status(404).json({ error: "Record not found" });
      }
      res.json(record);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch record" });
    }
  });

  app.post("/api/intake-records", async (req, res) => {
    try {
      const validated = insertIntakeRecordSchema.parse(req.body);
      const record = await storage.createIntakeRecord(validated);
      
      // Auto-generate tasks if event date is set
      if (record.eventDate) {
        const eventDate = new Date(record.eventDate);
        const createdDate = new Date(record.createdAt);
        
        const tasksToCreate = [
          {
            intakeId: record.id,
            title: 'Initial Follow-up',
            dueDate: addDays(createdDate, 2),
            completed: false,
            type: 'follow_up' as const,
          },
          {
            intakeId: record.id,
            title: 'Pre-Event Confirmation',
            dueDate: subDays(eventDate, 5),
            completed: false,
            type: 'pre_event' as const,
          },
          {
            intakeId: record.id,
            title: 'Final Reminder',
            dueDate: subDays(eventDate, 3),
            completed: false,
            type: 'reminder' as const,
          },
          {
            intakeId: record.id,
            title: 'Post-Event Follow-up',
            dueDate: addDays(eventDate, 1),
            completed: false,
            type: 'post_event' as const,
          }
        ];
        
        await Promise.all(tasksToCreate.map(task => storage.createTask(task)));
      }
      
      res.status(201).json(record);
    } catch (error) {
      res.status(400).json({ error: "Invalid data" });
    }
  });

  app.patch("/api/intake-records/:id", async (req, res) => {
    try {
      const validated = updateIntakeRecordSchema.parse(req.body);
      const existing = await storage.getIntakeRecord(req.params.id);
      
      if (!existing) {
        return res.status(404).json({ error: "Record not found" });
      }
      
      // Calculate flags
      const flags: string[] = [];
      const updated = { ...existing, ...validated };
      if (!updated.hasIndoorSpace) flags.push('No Indoor Space');
      if (updated.requiresRefrigeration && !updated.hasRefrigeration) flags.push('Fridge Risk');
      if (updated.sandwichCount >= 400) flags.push('High Volume (Rep Req)');
      
      const record = await storage.updateIntakeRecord(req.params.id, {
        ...validated,
        flags,
      });
      
      // Regenerate tasks if event date changed
      if (validated.eventDate && validated.eventDate !== existing.eventDate) {
        await storage.deleteTasksForIntake(req.params.id);
        
        const eventDate = new Date(validated.eventDate);
        const createdDate = new Date(existing.createdAt);
        
        const tasksToCreate = [
          {
            intakeId: req.params.id,
            title: 'Initial Follow-up',
            dueDate: addDays(createdDate, 2),
            completed: false,
            type: 'follow_up' as const,
          },
          {
            intakeId: req.params.id,
            title: 'Pre-Event Confirmation',
            dueDate: subDays(eventDate, 5),
            completed: false,
            type: 'pre_event' as const,
          },
          {
            intakeId: req.params.id,
            title: 'Final Reminder',
            dueDate: subDays(eventDate, 3),
            completed: false,
            type: 'reminder' as const,
          },
          {
            intakeId: req.params.id,
            title: 'Post-Event Follow-up',
            dueDate: addDays(eventDate, 1),
            completed: false,
            type: 'post_event' as const,
          }
        ];
        
        await Promise.all(tasksToCreate.map(task => storage.createTask(task)));
      }
      
      res.json(record);
    } catch (error) {
      res.status(400).json({ error: "Invalid data" });
    }
  });

  app.delete("/api/intake-records/:id", async (req, res) => {
    try {
      await storage.deleteIntakeRecord(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete record" });
    }
  });

  // Tasks
  app.get("/api/intake-records/:id/tasks", async (req, res) => {
    try {
      const tasks = await storage.getTasksForIntake(req.params.id);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const task = await storage.updateTask(req.params.id, req.body);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  // Platform Sync (stub for now - will need your main app's API details)
  app.post("/api/sync/pull", async (req, res) => {
    try {
      // TODO: Implement actual API call to your main platform
      // For now, just log the sync attempt
      await storage.createSyncLog({
        direction: 'pull',
        recordCount: 0,
        status: 'error',
        error: 'Not yet implemented - needs main platform API endpoint',
      });
      
      res.status(501).json({ 
        error: "Sync not yet configured. Please provide your main platform's API endpoint." 
      });
    } catch (error) {
      res.status(500).json({ error: "Sync failed" });
    }
  });

  app.get("/api/sync/logs", async (req, res) => {
    try {
      const logs = await storage.getRecentSyncLogs(10);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sync logs" });
    }
  });

  return httpServer;
}
