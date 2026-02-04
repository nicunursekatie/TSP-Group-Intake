import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertIntakeRecordSchema, updateIntakeRecordSchema, insertTaskSchema } from "@shared/schema";
import { addDays, subDays } from "date-fns";

// Platform integration config
const MAIN_PLATFORM_URL = process.env.MAIN_PLATFORM_URL;
const MAIN_PLATFORM_API_KEY = process.env.MAIN_PLATFORM_API_KEY;

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

  // Platform Sync - Pull new/in-progress event requests from main platform
  app.post("/api/sync/pull", async (req, res) => {
    try {
      if (!MAIN_PLATFORM_URL || !MAIN_PLATFORM_API_KEY) {
        await storage.createSyncLog({
          direction: 'pull',
          recordCount: 0,
          status: 'error',
          error: 'Missing MAIN_PLATFORM_URL or MAIN_PLATFORM_API_KEY environment variables',
        });
        return res.status(400).json({ 
          error: "Sync not configured. Please set MAIN_PLATFORM_URL and MAIN_PLATFORM_API_KEY." 
        });
      }

      // Fetch event requests from main platform
      const response = await fetch(`${MAIN_PLATFORM_URL}/api/event-requests?status=new,in_progress`, {
        headers: {
          'Authorization': `Bearer ${MAIN_PLATFORM_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        await storage.createSyncLog({
          direction: 'pull',
          recordCount: 0,
          status: 'error',
          error: `API Error: ${response.status} - ${errorText}`,
        });
        return res.status(response.status).json({ error: `Failed to fetch from main platform: ${errorText}` });
      }

      const eventRequests = await response.json();
      let importedCount = 0;

      // Map and import each event request
      for (const event of eventRequests) {
        // Check if already imported (by externalEventId)
        const existingRecords = await storage.listIntakeRecords();
        const alreadyExists = existingRecords.some(r => r.externalEventId === event.id?.toString());
        
        if (!alreadyExists) {
          await storage.createIntakeRecord({
            externalEventId: event.id?.toString(),
            organizationName: event.organizationName || event.organization_name || 'Unknown Org',
            contactName: event.contactName || event.contact_name || 'Unknown Contact',
            contactEmail: event.contactEmail || event.contact_email || '',
            contactPhone: event.contactPhone || event.contact_phone || '',
            eventDate: event.eventDate || event.event_date ? new Date(event.eventDate || event.event_date) : null,
            eventTime: event.eventTime || event.event_time || '',
            location: event.location || event.address || '',
            attendeeCount: event.attendeeCount || event.attendee_count || 0,
            sandwichCount: event.sandwichCount || event.sandwich_count || 0,
            dietaryRestrictions: event.dietaryRestrictions || event.dietary_restrictions || '',
            requiresRefrigeration: event.requiresRefrigeration || event.requires_refrigeration || false,
            hasIndoorSpace: (event.hasIndoorSpace || event.has_indoor_space) ?? true,
            hasRefrigeration: event.hasRefrigeration || event.has_refrigeration || false,
            deliveryInstructions: event.deliveryInstructions || event.delivery_instructions || '',
            status: 'New',
            ownerId: null,
            flags: [],
            internalNotes: `Imported from main platform on ${new Date().toISOString()}`,
          });
          importedCount++;
        }
      }

      await storage.createSyncLog({
        direction: 'pull',
        recordCount: importedCount,
        status: 'success',
        error: null,
      });

      res.json({ 
        success: true, 
        imported: importedCount,
        total: eventRequests.length,
        message: `Imported ${importedCount} new event requests` 
      });
    } catch (error: any) {
      await storage.createSyncLog({
        direction: 'pull',
        recordCount: 0,
        status: 'error',
        error: error.message || 'Unknown error',
      });
      res.status(500).json({ error: error.message || "Sync failed" });
    }
  });

  // Platform Sync - Push completed intake data back to main platform
  app.post("/api/sync/push/:id", async (req, res) => {
    try {
      if (!MAIN_PLATFORM_URL || !MAIN_PLATFORM_API_KEY) {
        return res.status(400).json({ 
          error: "Sync not configured. Please set MAIN_PLATFORM_URL and MAIN_PLATFORM_API_KEY." 
        });
      }

      const record = await storage.getIntakeRecord(req.params.id);
      if (!record) {
        return res.status(404).json({ error: "Record not found" });
      }

      if (!record.externalEventId) {
        return res.status(400).json({ error: "This record was not imported from the main platform" });
      }

      // Push updates back to main platform
      const response = await fetch(`${MAIN_PLATFORM_URL}/api/event-requests/${record.externalEventId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${MAIN_PLATFORM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationName: record.organizationName,
          contactName: record.contactName,
          contactEmail: record.contactEmail,
          contactPhone: record.contactPhone,
          eventDate: record.eventDate,
          eventTime: record.eventTime,
          location: record.location,
          attendeeCount: record.attendeeCount,
          sandwichCount: record.sandwichCount,
          dietaryRestrictions: record.dietaryRestrictions,
          hasIndoorSpace: record.hasIndoorSpace,
          hasRefrigeration: record.hasRefrigeration,
          deliveryInstructions: record.deliveryInstructions,
          intakeStatus: record.status,
          intakeNotes: record.internalNotes,
          intakeFlags: record.flags,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        await storage.createSyncLog({
          direction: 'push',
          recordCount: 0,
          status: 'error',
          error: `API Error: ${response.status} - ${errorText}`,
        });
        return res.status(response.status).json({ error: `Failed to update main platform: ${errorText}` });
      }

      await storage.createSyncLog({
        direction: 'push',
        recordCount: 1,
        status: 'success',
        error: null,
      });

      res.json({ success: true, message: "Successfully synced to main platform" });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Push sync failed" });
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
