import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertIntakeRecordSchema, updateIntakeRecordSchema } from "@shared/schema";
import { addDays, subDays } from "date-fns";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { authStorage } from "./replit_integrations/auth/storage";

// Platform integration config
const MAIN_PLATFORM_URL = process.env.MAIN_PLATFORM_URL;
const MAIN_PLATFORM_API_KEY = process.env.MAIN_PLATFORM_API_KEY;

// Helper to get user from request
function getUserId(req: Request): string | null {
  const user = req.user as any;
  return user?.claims?.sub || null;
}

// Middleware to check if user is approved
const isApproved = async (req: Request, res: Response, next: NextFunction) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  const user = await authStorage.getUser(userId);
  if (!user || user.approvalStatus !== 'approved') {
    return res.status(403).json({ error: "Account pending approval" });
  }
  
  next();
};

// Middleware to check if user is admin
const isAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  const user = await authStorage.getUser(userId);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: "Admin access required" });
  }
  
  next();
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Setup Replit Auth (MUST be before other routes)
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // Admin routes for user management
  app.get("/api/admin/users", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const users = await storage.listUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.patch("/api/admin/users/:id/approve", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const adminId = getUserId(req);
      const { role } = req.body;
      const user = await storage.approveUser(req.params.id, adminId!, role || 'volunteer');
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to approve user" });
    }
  });

  app.patch("/api/admin/users/:id/reject", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const user = await storage.rejectUser(req.params.id);
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to reject user" });
    }
  });

  app.patch("/api/admin/users/:id/role", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { role } = req.body;
      const user = await storage.updateUserRole(req.params.id, role);
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user role" });
    }
  });

  // User Settings routes
  app.get("/api/settings", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await authStorage.getUser(userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        platformUserId: user.platformUserId || null,
        smsAlertsEnabled: user.smsAlertsEnabled === 'true',
        emailNotificationsEnabled: user.emailNotificationsEnabled === 'true',
        notifyOnNewIntake: user.notifyOnNewIntake === 'true',
        notifyOnTaskDue: user.notifyOnTaskDue === 'true',
        notifyOnStatusChange: user.notifyOnStatusChange === 'true',
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/settings", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const body = req.body;
      
      // Only include fields that are explicitly provided in the request
      const updates: any = {};
      
      if ('phoneNumber' in body) {
        updates.phoneNumber = body.phoneNumber;
      }
      if ('platformUserId' in body) {
        updates.platformUserId = body.platformUserId || null;
      }
      if ('smsAlertsEnabled' in body) {
        updates.smsAlertsEnabled = body.smsAlertsEnabled ? 'true' : 'false';
      }
      if ('emailNotificationsEnabled' in body) {
        updates.emailNotificationsEnabled = body.emailNotificationsEnabled ? 'true' : 'false';
      }
      if ('notifyOnNewIntake' in body) {
        updates.notifyOnNewIntake = body.notifyOnNewIntake ? 'true' : 'false';
      }
      if ('notifyOnTaskDue' in body) {
        updates.notifyOnTaskDue = body.notifyOnTaskDue ? 'true' : 'false';
      }
      if ('notifyOnStatusChange' in body) {
        updates.notifyOnStatusChange = body.notifyOnStatusChange ? 'true' : 'false';
      }
      
      const user = await storage.updateUserSettings(userId!, updates);
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  app.post("/api/settings/verify-phone", isAuthenticated, async (req, res) => {
    try {
      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number required" });
      }
      
      const { sendVerificationSMS } = await import("./services/twilio");
      const code = await sendVerificationSMS(phoneNumber);
      
      if (!code) {
        return res.status(500).json({ error: "Failed to send verification SMS" });
      }
      
      // Store code in session for verification (simplified - in production use proper storage)
      (req.session as any).phoneVerificationCode = code;
      (req.session as any).phoneVerificationNumber = phoneNumber;
      
      res.json({ success: true, message: "Verification code sent" });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to send verification" });
    }
  });

  app.post("/api/settings/confirm-phone", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { code } = req.body;
      
      const storedCode = (req.session as any).phoneVerificationCode;
      const phoneNumber = (req.session as any).phoneVerificationNumber;
      
      if (!storedCode || !phoneNumber) {
        return res.status(400).json({ error: "No verification pending" });
      }
      
      if (code !== storedCode) {
        return res.status(400).json({ error: "Invalid verification code" });
      }
      
      // Update user with verified phone number
      await storage.updateUserSettings(userId!, { phoneNumber });
      
      // Clear session data
      delete (req.session as any).phoneVerificationCode;
      delete (req.session as any).phoneVerificationNumber;
      
      res.json({ success: true, message: "Phone number verified" });
    } catch (error) {
      res.status(500).json({ error: "Failed to verify phone" });
    }
  });

  app.post("/api/settings/test-email", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await authStorage.getUser(userId!);
      
      if (!user?.email) {
        return res.status(400).json({ error: "No email address on file" });
      }
      
      const { sendNotificationEmail } = await import("./services/sendgrid");
      const success = await sendNotificationEmail(
        user.email,
        "Test Notification",
        "This is a test email from TSP Intake to confirm your email notifications are working correctly."
      );
      
      if (!success) {
        return res.status(500).json({ error: "Failed to send test email" });
      }
      
      res.json({ success: true, message: "Test email sent" });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to send test email" });
    }
  });

  app.post("/api/settings/test-sms", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await authStorage.getUser(userId!);
      
      if (!user?.phoneNumber) {
        return res.status(400).json({ error: "No phone number on file" });
      }
      
      const { sendSMS } = await import("./services/twilio");
      const success = await sendSMS(
        user.phoneNumber,
        "TSP Intake: Test SMS notification. Your alerts are working!"
      );
      
      if (!success) {
        return res.status(500).json({ error: "Failed to send test SMS" });
      }
      
      res.json({ success: true, message: "Test SMS sent" });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to send test SMS" });
    }
  });

  // Intake Records (protected - requires authenticated and approved users)
  app.get("/api/intake-records", isAuthenticated, isApproved, async (req, res) => {
    try {
      const records = await storage.listIntakeRecords();
      res.json(records);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch records" });
    }
  });

  app.get("/api/intake-records/:id", isAuthenticated, isApproved, async (req, res) => {
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

  app.post("/api/intake-records", isAuthenticated, isApproved, async (req, res) => {
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

  app.patch("/api/intake-records/:id", isAuthenticated, isApproved, async (req, res) => {
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

  app.delete("/api/intake-records/:id", isAuthenticated, isApproved, async (req, res) => {
    try {
      await storage.deleteIntakeRecord(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete record" });
    }
  });

  // Tasks (protected)
  app.get("/api/intake-records/:id/tasks", isAuthenticated, isApproved, async (req, res) => {
    try {
      const tasks = await storage.getTasksForIntake(req.params.id);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.patch("/api/tasks/:id", isAuthenticated, isApproved, async (req, res) => {
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

  // Platform Sync - Pull new event requests assigned to current user from main platform
  app.post("/api/sync/pull", isAuthenticated, isApproved, async (req, res) => {
    try {
      const userId = getUserId(req);
      const currentUser = await authStorage.getUser(userId!);
      
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

      // User must have their platform user ID linked to sync
      if (!currentUser?.platformUserId) {
        return res.status(400).json({
          error: "Please link your Platform User ID in Account Settings before syncing."
        });
      }

      // Build query params - filter by tspContact (platform user ID) and status
      const queryParams = new URLSearchParams({
        tspContact: currentUser.platformUserId,
        status: 'new request',
      });

      // Fetch event requests from main platform using the external API endpoint
      const apiUrl = `${MAIN_PLATFORM_URL}/api/external/event-requests?${queryParams.toString()}`;
      console.log(`Sync pull: Fetching from ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${MAIN_PLATFORM_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Sync pull failed: ${response.status} - ${errorText}`);
        await storage.createSyncLog({
          direction: 'pull',
          recordCount: 0,
          status: 'error',
          error: `API Error: ${response.status} - ${errorText}`,
        });
        return res.status(response.status).json({ error: `Failed to fetch from main platform: ${errorText}` });
      }

      const data = await response.json();
      const eventRequests = Array.isArray(data) ? data : (data.eventRequests || data.data || []);
      let importedCount = 0;

      // Get existing records once for efficiency
      const existingRecords = await storage.listIntakeRecords();
      const existingExternalIds = new Set(existingRecords.map(r => r.externalEventId).filter(Boolean));

      // Map and import each event request
      for (const event of eventRequests) {
        const externalId = (event.id || event.eventRequestId)?.toString();
        
        // Skip if already imported
        if (existingExternalIds.has(externalId)) {
          continue;
        }
        
        await storage.createIntakeRecord({
          externalEventId: externalId,
          organizationName: event.organizationName || event.organization_name || event.orgName || 'Unknown Org',
          contactName: event.contactName || event.contact_name || event.primaryContact || 'Unknown Contact',
          contactEmail: event.contactEmail || event.contact_email || event.email || '',
          contactPhone: event.contactPhone || event.contact_phone || event.phone || '',
          eventDate: event.eventDate || event.event_date || event.preferredDate ? new Date(event.eventDate || event.event_date || event.preferredDate) : null,
          eventTime: event.eventTime || event.event_time || event.preferredTime || '',
          location: event.location || event.address || event.eventLocation || '',
          attendeeCount: event.attendeeCount || event.attendee_count || event.estimatedAttendees || 0,
          sandwichCount: event.sandwichCount || event.sandwich_count || event.sandwichesRequested || 0,
          dietaryRestrictions: event.dietaryRestrictions || event.dietary_restrictions || event.dietaryNotes || '',
          requiresRefrigeration: event.requiresRefrigeration || event.requires_refrigeration || false,
          hasIndoorSpace: (event.hasIndoorSpace || event.has_indoor_space || event.indoorSpace) ?? true,
          hasRefrigeration: event.hasRefrigeration || event.has_refrigeration || event.refrigerationAvailable || false,
          deliveryInstructions: event.deliveryInstructions || event.delivery_instructions || event.specialInstructions || '',
          status: 'New',
          ownerId: userId,
          flags: [],
          internalNotes: `Imported from main platform on ${new Date().toISOString()}`,
        });
        importedCount++;
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
      console.error('Sync pull error:', error);
      await storage.createSyncLog({
        direction: 'pull',
        recordCount: 0,
        status: 'error',
        error: error.message || 'Unknown error',
      });
      res.status(500).json({ error: error.message || "Sync failed" });
    }
  });

  // Platform Sync - Push intake data back to main platform and mark as scheduled
  app.post("/api/sync/push/:id", isAuthenticated, isApproved, async (req, res) => {
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

      // Verify the caller owns this record or is an admin
      const userId = getUserId(req);
      const currentUser = await authStorage.getUser(userId!);
      if (record.ownerId !== userId && currentUser?.role !== 'admin') {
        return res.status(403).json({ error: "You can only sync records assigned to you" });
      }

      // Push updates back to main platform using the external API endpoint
      const apiUrl = `${MAIN_PLATFORM_URL}/api/external/event-requests/${record.externalEventId}`;
      console.log(`Sync push: Updating ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${MAIN_PLATFORM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'scheduled',
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
        console.error(`Sync push failed: ${response.status} - ${errorText}`);
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

      res.json({ success: true, message: "Successfully synced to main platform (marked as scheduled)" });
    } catch (error: any) {
      console.error('Sync push error:', error);
      res.status(500).json({ error: error.message || "Push sync failed" });
    }
  });

  app.get("/api/sync/logs", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const logs = await storage.getRecentSyncLogs(10);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sync logs" });
    }
  });

  return httpServer;
}
