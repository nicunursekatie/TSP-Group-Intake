import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertIntakeRecordSchema, updateIntakeRecordSchema, users } from "@shared/schema";
import { addDays, subDays } from "date-fns";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { authStorage } from "./replit_integrations/auth/storage";
import { eventRequests } from "@shared/platformTables";
import { db, pool, testConnection } from "./db";
import { eq, and, or, inArray, isNotNull } from "drizzle-orm";

// Helper to get user from request (reads from session)
function getUserId(req: Request): string | null {
  return (req.session as any)?.userId || null;
}

// Middleware to check if user is approved
const isApproved = async (req: Request, res: Response, next: NextFunction) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = await authStorage.getUser(userId);
  if (!user) {
    return res.status(403).json({ error: "Account pending approval" });
  }

  // Platform admins/coordinators are auto-approved on the intake app
  if (user.approvalStatus !== 'approved' && (user.role === 'admin' || user.role === 'admin_coordinator')) {
    await storage.approveUser(user.id, 'system', user.role);
    return next();
  }

  if (user.approvalStatus !== 'approved') {
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
  if (!user || (user.role !== 'admin' && user.role !== 'admin_coordinator')) {
    return res.status(403).json({ error: "Admin access required" });
  }

  next();
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ── Diagnostic endpoint — hit /api/debug/db in browser to see what's going on ──
  app.get("/api/debug/db", async (req, res) => {
    // Show BOTH env vars so we can see what Replit is doing
    const prodUrl = process.env.PRODUCTION_DATABASE_URL || '';
    const rawDbUrl = process.env.DATABASE_URL || '';
    const actualUrl = prodUrl || rawDbUrl; // same logic as db.ts

    let prodHostname = 'not set';
    let dbUrlHostname = 'not set';
    let actualHostname = 'not set';

    try { prodHostname = new URL(prodUrl).hostname; } catch {}
    try { dbUrlHostname = new URL(rawDbUrl).hostname; } catch {}
    try { actualHostname = new URL(actualUrl).hostname; } catch {}

    // Direct connection test with full error capture
    let connectionTest = 'not run';
    let errorDetail = null;
    let pgInfo = null;

    try {
      const client = await pool.connect();
      const r = await client.query('SELECT current_database(), current_user, version()');
      pgInfo = {
        db: r.rows[0].current_database,
        user: r.rows[0].current_user,
        version: r.rows[0].version?.split(',')[0],
      };
      client.release();
      connectionTest = 'SUCCESS';
    } catch (err: any) {
      connectionTest = 'FAILED';
      errorDetail = {
        message: err.message,
        code: err.code,
        severity: err.severity,
        hint: err.hint,
      };
    }

    res.json({
      whichUrlPoolUses: actualHostname,
      PRODUCTION_DATABASE_URL_hostname: prodHostname,
      DATABASE_URL_hostname: dbUrlHostname,
      mismatch: prodHostname !== dbUrlHostname,
      connectionTest,
      pgInfo,
      errorDetail,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        REPLIT_DEPLOYMENT: process.env.REPLIT_DEPLOYMENT,
      },
    });
  });

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
      const user = await storage.approveUser(req.params.id, adminId!, role || 'intake_team');
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

  // Admin: Create a new user account (pre-approved)
  app.post("/api/admin/users", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const adminId = getUserId(req);
      const { email, firstName, lastName, role } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ error: "A user with that email already exists" });
      }

      const user = await storage.createUser({
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        role: role || 'intake_team',
        approvalStatus: 'approved',
        approvedBy: adminId!,
      });

      // Auto-lookup platform ID by email (direct DB query on shared users table)
      try {
        const [platformUser] = await db.select({ id: users.id })
          .from(users)
          .where(and(
            eq(users.email, email),
            isNotNull(users.password) // Platform users have passwords; Replit OIDC users don't
          ))
          .limit(1);
        if (platformUser) {
          await storage.updateUserSettings(user.id, { platformUserId: platformUser.id });
          return res.status(201).json({ ...user, platformUserId: platformUser.id, platformLinked: true });
        }
      } catch (err: any) {
        console.error('Auto platform lookup failed for new user:', err.message);
      }

      res.status(201).json({ ...user, platformLinked: false });
    } catch (error: any) {
      console.error('Create user error:', error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  // Admin: Trigger platform ID lookup for a specific user (direct DB query)
  app.post("/api/admin/users/:id/link-platform", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const user = await authStorage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (!user.email) {
        return res.status(400).json({ error: "User has no email address" });
      }

      // Look up platform user by email in the shared users table
      const [platformUser] = await db.select({ id: users.id })
        .from(users)
        .where(and(
          eq(users.email, user.email),
          isNotNull(users.password)
        ))
        .limit(1);

      if (!platformUser) {
        return res.status(404).json({ error: `No platform account found for ${user.email}` });
      }

      await storage.updateUserSettings(req.params.id, { platformUserId: platformUser.id });
      res.json({ success: true, platformUserId: platformUser.id });
    } catch (error: any) {
      console.error('Admin platform link error:', error);
      res.status(500).json({ error: "Failed to link platform account" });
    }
  });

  // Admin: Bulk auto-link all unlinked approved users to the platform (direct DB)
  app.post("/api/admin/users/bulk-link-platform", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const allUsers = await storage.listUsers();
      const unlinked = allUsers.filter(u => u.approvalStatus === 'approved' && !u.platformUserId && u.email);

      let linked = 0;
      let failed = 0;
      const results: { email: string; status: string; platformUserId?: string }[] = [];

      for (const user of unlinked) {
        try {
          const [platformUser] = await db.select({ id: users.id })
            .from(users)
            .where(and(
              eq(users.email, user.email!),
              isNotNull(users.password)
            ))
            .limit(1);

          if (platformUser) {
            await storage.updateUserSettings(user.id, { platformUserId: platformUser.id });
            linked++;
            results.push({ email: user.email!, status: 'linked', platformUserId: platformUser.id });
          } else {
            failed++;
            results.push({ email: user.email!, status: 'not_found' });
          }
        } catch (err: any) {
          failed++;
          results.push({ email: user.email!, status: 'error' });
        }
      }

      res.json({ success: true, linked, failed, total: unlinked.length, results });
    } catch (error: any) {
      console.error('Bulk link error:', error);
      res.status(500).json({ error: "Bulk link failed" });
    }
  });

  // Admin: Manually set platform ID for a user
  app.patch("/api/admin/users/:id/platform-id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { platformUserId } = req.body;
      await storage.updateUserSettings(req.params.id, { platformUserId: platformUserId || null });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update platform ID" });
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

  app.post("/api/settings/lookup-platform-id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await authStorage.getUser(userId!);
      if (!user?.email) {
        return res.status(400).json({ error: "No email address on your account. Cannot look up platform ID." });
      }

      console.log(`Platform user lookup (direct DB) for: ${user.email}`);

      // Look up platform user by email in the shared users table
      const [platformUser] = await db.select({ id: users.id })
        .from(users)
        .where(and(
          eq(users.email, user.email),
          isNotNull(users.password) // Platform users have passwords; Replit OIDC users don't
        ))
        .limit(1);

      if (!platformUser) {
        return res.status(404).json({ error: "No matching user found on the main platform for your email address." });
      }

      await storage.updateUserSettings(userId!, { platformUserId: platformUser.id });

      res.json({ success: true, platformUserId: platformUser.id });
    } catch (error: any) {
      console.error('Platform user lookup error:', error);
      res.status(500).json({ error: "Failed to look up platform user ID." });
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
      
      // Auto-transition: first contact attempt moves New → In Process
      if (
        existing.status === 'New' &&
        validated.contactAttemptsLog &&
        Array.isArray(validated.contactAttemptsLog) &&
        validated.contactAttemptsLog.length > 0 &&
        (!existing.contactAttemptsLog || (existing.contactAttemptsLog as any[]).length === 0)
      ) {
        (validated as any).status = 'In Process';
      }

      // Calculate flags
      const flags: string[] = [];
      const updated = { ...existing, ...validated };
      if (!updated.hasIndoorSpace) flags.push('Not Indoors');
      if (updated.requiresRefrigeration && !updated.refrigerationConfirmed) flags.push('Refrigeration Not Confirmed');
      if (updated.sandwichCount >= 400) flags.push('High Volume (Rep Req)');
      
      const record = await storage.updateIntakeRecord(req.params.id, {
        ...validated,
        flags,
      });

      // Sync status to main platform's event_requests table if this record was imported
      if (record?.externalEventId) {
        const statusChanged = validated.status && validated.status !== existing.status;
        // Auto-update platform when coordinator starts working (status moves from New → In Process)
        if (statusChanged && validated.status === 'In Process') {
          try {
            await db.update(eventRequests)
              .set({ status: 'in_process' })
              .where(eq(eventRequests.id, parseInt(record.externalEventId)));
            console.log(`Platform status updated to in_process for event ${record.externalEventId}`);
          } catch (err: any) {
            console.error('Failed to update platform status:', err.message);
          }
        }
      }

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

  // Platform Sync - Pull event requests assigned to current user (direct DB query)
  app.post("/api/sync/pull", isAuthenticated, isApproved, async (req, res) => {
    try {
      const userId = getUserId(req);
      const currentUser = await authStorage.getUser(userId!);

      // User must have their platform user ID linked to sync
      if (!currentUser?.platformUserId) {
        return res.status(400).json({
          error: "Please link your Platform User ID in Account Settings before syncing."
        });
      }

      console.log(`Sync pull (direct DB): User ${currentUser.email} platformUserId="${currentUser.platformUserId}"`);

      // Query the main platform's event_requests table directly
      const events = await db.select().from(eventRequests)
        .where(and(
          or(
            eq(eventRequests.tspContactAssigned, currentUser.platformUserId),
            eq(eventRequests.tspContact, currentUser.platformUserId)
          ),
          inArray(eventRequests.status, ['new', 'in_process', 'scheduled', 'completed'])
        ));

      console.log(`Sync pull: Found ${events.length} event requests in DB`);

      let importedCount = 0;
      let updatedCount = 0;

      // Map platform status → local intake status
      const platformStatusToLocal: Record<string, string> = {
        'new': 'New',
        'in_process': 'In Process',
        'scheduled': 'Scheduled',
        'completed': 'Completed',
      };

      // Build lookup map of existing records by externalEventId
      const existingRecords = await storage.listIntakeRecords();
      const existingByExternalId = new Map<string, typeof existingRecords[0]>();
      for (const r of existingRecords) {
        if (r.externalEventId) {
          existingByExternalId.set(r.externalEventId, r);
        }
      }

      for (const event of events) {
        const externalId = event.id.toString();
        const existing = existingByExternalId.get(externalId);

        // Drizzle returns proper types — timestamps are already Date objects
        const contactName = [event.firstName, event.lastName].filter(Boolean).join(' ') || 'Unknown Contact';
        const platformStatus = event.status?.toLowerCase() || 'new';
        const localStatus = platformStatusToLocal[platformStatus] || 'New';

        // Build the full record data from platform fields
        const recordData = {
          externalEventId: externalId,
          // Contact
          contactName,
          contactFirstName: event.firstName || null,
          contactLastName: event.lastName || null,
          contactEmail: event.email || '',
          contactPhone: event.phone || '',
          // Backup contact
          backupContactFirstName: event.backupContactFirstName || null,
          backupContactLastName: event.backupContactLastName || null,
          backupContactEmail: event.backupContactEmail || null,
          backupContactPhone: event.backupContactPhone || null,
          backupContactRole: event.backupContactRole || null,
          // Organization
          organizationName: event.organizationName || 'Unknown Org',
          organizationCategory: event.organizationCategory || null,
          department: event.department || null,
          // Event dates & times
          eventDate: event.scheduledEventDate || event.desiredEventDate || null,
          desiredEventDate: event.desiredEventDate || null,
          scheduledEventDate: event.scheduledEventDate || null,
          dateFlexible: event.dateFlexible ?? null,
          eventTime: event.eventStartTime || '',
          eventStartTime: event.eventStartTime || null,
          eventEndTime: event.eventEndTime || null,
          // Location
          location: event.eventAddress || '',
          eventAddress: event.eventAddress || null,
          latitude: event.latitude || null,
          longitude: event.longitude || null,
          // Counts
          attendeeCount: event.volunteerCount || 0,
          volunteerCount: event.volunteerCount || null,
          sandwichCount: event.estimatedSandwichCount || 0,
          actualSandwichCount: event.actualSandwichCount || null,
          message: event.message || null,
          // Logistics
          hasRefrigeration: event.hasRefrigeration || false,
          pickupTimeWindow: event.pickupTimeWindow || null,
          // Assignment
          tspContactAssigned: event.tspContactAssigned || null,
          tspContact: event.tspContact || null,
          customTspContact: event.customTspContact || null,
          // Notes & tracking
          planningNotes: event.planningNotes || null,
          schedulingNotes: event.schedulingNotes || null,
          nextAction: event.nextAction || null,
          contactAttempts: event.contactAttempts || null,
          contactAttemptsLog: event.contactAttemptsLog as any[] || null,
          // Status
          status: localStatus,
        };

        if (existing) {
          // Timestamp-aware merge: compare platform vs local updatedAt
          const statusRank: Record<string, number> = { 'New': 0, 'In Process': 1, 'Scheduled': 2, 'Completed': 3 };
          const platformRank = statusRank[localStatus] ?? 0;
          const localRank = statusRank[existing.status] ?? 0;

          const platformUpdated = event.updatedAt ? new Date(event.updatedAt) : new Date(0);
          const localUpdated = new Date(existing.updatedAt);
          const platformIsNewer = platformUpdated > localUpdated;

          // Build update — only include fields that actually differ
          const updates: any = {};

          // Status: always allow advancement, never regress
          if (platformRank > localRank) {
            updates.status = localStatus;
          }

          // Shared fields: only overwrite local if platform is newer
          if (platformIsNewer) {
            const sharedFieldMap: Record<string, any> = { ...recordData };
            delete sharedFieldMap.externalEventId;
            delete sharedFieldMap.status; // handled separately above

            for (const [key, platformValue] of Object.entries(sharedFieldMap)) {
              const localValue = (existing as any)[key];
              const pStr = platformValue == null ? '' : String(platformValue);
              const lStr = localValue == null ? '' : String(localValue);
              if (pStr !== lStr) {
                updates[key] = platformValue;
              }
            }
          }

          if (Object.keys(updates).length > 0) {
            await storage.updateIntakeRecord(existing.id, updates);
            updatedCount++;
          }
        } else {
          // New record — import it
          await storage.createIntakeRecord({
            ...recordData,
            requiresRefrigeration: false,
            hasIndoorSpace: true,
            ownerId: userId,
            flags: [],
            internalNotes: `Imported from main platform on ${new Date().toISOString()}`,
          });
          importedCount++;
        }
      }

      await storage.createSyncLog({
        direction: 'pull',
        recordCount: importedCount + updatedCount,
        status: 'success',
        error: null,
      });

      res.json({
        success: true,
        imported: importedCount,
        updated: updatedCount,
        total: events.length,
        message: `Imported ${importedCount} new, updated ${updatedCount} existing`
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

  // Platform Sync - Push intake data back to main platform (direct DB update)
  // Only sends fields that changed; respects platform's updatedAt to avoid overwriting fresher data
  app.post("/api/sync/push/:id", isAuthenticated, isApproved, async (req, res) => {
    try {
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
      if (record.ownerId !== userId && currentUser?.role !== 'admin' && currentUser?.role !== 'admin_coordinator') {
        return res.status(403).json({ error: "You can only sync records assigned to you" });
      }

      const eventId = parseInt(record.externalEventId);
      console.log(`Sync push (direct DB): Updating event_requests id=${eventId}`);

      // Fetch current platform record to compare timestamps and values
      const [platformRecord] = await db.select().from(eventRequests)
        .where(eq(eventRequests.id, eventId)).limit(1);

      if (!platformRecord) {
        return res.status(404).json({ error: "Platform record no longer exists" });
      }

      const localUpdated = new Date(record.updatedAt);
      const platformUpdated = platformRecord.updatedAt ? new Date(platformRecord.updatedAt) : new Date(0);

      // Map intake status back to platform status
      const statusMap: Record<string, string> = {
        'Scheduled': 'scheduled',
        'Completed': 'completed',
        'In Process': 'in_process',
        'New': 'new',
      };

      // Build what we WOULD send, then diff against what's already on the platform
      const candidateFields: Record<string, any> = {
        status: statusMap[record.status] || 'in_process',
        organizationName: record.organizationName,
        organizationCategory: record.organizationCategory,
        department: record.department,
        firstName: record.contactFirstName,
        lastName: record.contactLastName,
        email: record.contactEmail,
        phone: record.contactPhone,
        backupContactFirstName: record.backupContactFirstName,
        backupContactLastName: record.backupContactLastName,
        backupContactEmail: record.backupContactEmail,
        backupContactPhone: record.backupContactPhone,
        backupContactRole: record.backupContactRole,
        scheduledEventDate: record.scheduledEventDate || record.eventDate,
        desiredEventDate: record.desiredEventDate,
        dateFlexible: record.dateFlexible,
        eventStartTime: record.eventStartTime,
        eventEndTime: record.eventEndTime,
        eventAddress: record.eventAddress || record.location,
        volunteerCount: record.volunteerCount || record.attendeeCount,
        estimatedSandwichCount: record.sandwichCount,
        actualSandwichCount: record.actualSandwichCount,
        message: record.message,
        hasRefrigeration: record.hasRefrigeration,
        pickupTimeWindow: record.pickupTimeWindow,
        planningNotes: record.planningNotes,
        schedulingNotes: record.schedulingNotes,
        nextAction: record.nextAction,
        contactAttempts: record.contactAttempts,
      };

      // Only send fields that actually differ from what's on the platform
      const changedFields: Record<string, any> = {};
      for (const [key, intakeValue] of Object.entries(candidateFields)) {
        const platformValue = (platformRecord as any)[key];
        // Compare stringified to handle Date/null/undefined differences
        const intakeStr = intakeValue == null ? '' : String(intakeValue);
        const platformStr = platformValue == null ? '' : String(platformValue);
        if (intakeStr !== platformStr) {
          changedFields[key] = intakeValue;
        }
      }

      // If the platform was updated more recently, only push status advances and intake-specific fields
      // (fields the platform doesn't manage itself, like contactAttempts, notes, status)
      const intakeOnlyFields = ['status', 'planningNotes', 'schedulingNotes', 'nextAction', 'contactAttempts', 'actualSandwichCount'];
      if (platformUpdated > localUpdated) {
        console.log(`Sync push: Platform is newer (${platformUpdated.toISOString()} > ${localUpdated.toISOString()}), limiting push to intake-managed fields`);
        for (const key of Object.keys(changedFields)) {
          if (!intakeOnlyFields.includes(key)) {
            delete changedFields[key];
          }
        }
      }

      if (Object.keys(changedFields).length === 0) {
        console.log(`Sync push: No changes to send for event_requests id=${eventId}`);
        return res.json({ success: true, message: "Already up to date — no changes to push", fieldsUpdated: 0 });
      }

      // Always update the timestamp when we push
      changedFields.updatedAt = new Date();

      console.log(`Sync push: Updating ${Object.keys(changedFields).length} fields: ${Object.keys(changedFields).join(', ')}`);

      await db.update(eventRequests)
        .set(changedFields)
        .where(eq(eventRequests.id, eventId));

      await storage.createSyncLog({
        direction: 'push',
        recordCount: 1,
        status: 'success',
        error: null,
      });

      res.json({
        success: true,
        message: `Synced ${Object.keys(changedFields).length} updated fields to platform`,
        fieldsUpdated: Object.keys(changedFields).length,
        fields: Object.keys(changedFields).filter(k => k !== 'updatedAt'),
      });
    } catch (error: any) {
      console.error('Sync push error:', error);
      await storage.createSyncLog({
        direction: 'push',
        recordCount: 0,
        status: 'error',
        error: error.message || 'Push failed',
      });
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
