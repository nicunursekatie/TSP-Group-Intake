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

// Wake up a sleeping Replit app by hitting its root URL first
async function wakePlatform(): Promise<void> {
  if (!MAIN_PLATFORM_URL) return;
  try {
    console.log(`Waking platform at ${MAIN_PLATFORM_URL}...`);
    await fetch(MAIN_PLATFORM_URL, { method: 'GET', signal: AbortSignal.timeout(10000) });
    console.log('Platform wake ping succeeded');
  } catch (err: any) {
    console.log(`Platform wake ping failed (${err.code || err.message}), continuing anyway...`);
  }
}

// Fetch with retry for Replit-to-Replit calls (handles sleeping apps)
async function platformFetch(url: string, options: RequestInit, retries = 4): Promise<globalThis.Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // On first attempt, send a wake-up ping and wait for platform to boot
      if (attempt === 1) {
        await wakePlatform();
        await new Promise(r => setTimeout(r, 2000)); // Give it 2s to fully wake
      }
      console.log(`Platform fetch attempt ${attempt}/${retries}: ${url}`);
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
      console.log(`Platform fetch attempt ${attempt} succeeded: ${response.status}`);
      return response;
    } catch (err: any) {
      const isLastAttempt = attempt === retries;
      console.error(`Platform fetch attempt ${attempt}/${retries} failed:`, err.code || err.message);
      if (isLastAttempt) throw err;
      const delay = attempt * 3000; // 3s, 6s, 9s
      console.log(`Retrying in ${delay/1000}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('platformFetch: unreachable');
}

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

      // Auto-lookup platform ID by email
      if (MAIN_PLATFORM_URL && MAIN_PLATFORM_API_KEY) {
        try {
          const apiUrl = `${MAIN_PLATFORM_URL}/api/external/event-requests/user-lookup?email=${encodeURIComponent(email)}`;
          const response = await platformFetch(apiUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${MAIN_PLATFORM_API_KEY}`,
              'Content-Type': 'application/json',
            },
          });
          if (response.ok) {
            const data = await response.json();
            const platformUserId = data.data?.userId || data.userId;
            if (platformUserId) {
              await storage.updateUserSettings(user.id, { platformUserId });
              return res.status(201).json({ ...user, platformUserId, platformLinked: true });
            }
          }
        } catch (err: any) {
          console.error('Auto platform lookup failed for new user:', err.message);
        }
      }

      res.status(201).json({ ...user, platformLinked: false });
    } catch (error: any) {
      console.error('Create user error:', error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  // Admin: Trigger platform ID lookup for a specific user
  app.post("/api/admin/users/:id/link-platform", isAuthenticated, isAdmin, async (req, res) => {
    try {
      if (!MAIN_PLATFORM_URL || !MAIN_PLATFORM_API_KEY) {
        return res.status(400).json({ error: "Platform sync not configured." });
      }

      const user = await authStorage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (!user.email) {
        return res.status(400).json({ error: "User has no email address" });
      }

      const apiUrl = `${MAIN_PLATFORM_URL}/api/external/event-requests/user-lookup?email=${encodeURIComponent(user.email)}`;
      const response = await platformFetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${MAIN_PLATFORM_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).json({ error: `No platform account found for ${user.email}` });
        }
        return res.status(response.status).json({ error: "Platform lookup failed" });
      }

      const data = await response.json();
      const platformUserId = data.data?.userId || data.userId;

      if (!platformUserId) {
        return res.status(404).json({ error: "Could not find a platform user ID" });
      }

      await storage.updateUserSettings(req.params.id, { platformUserId });
      res.json({ success: true, platformUserId });
    } catch (error: any) {
      console.error('Admin platform link error:', error);
      res.status(500).json({ error: "Failed to link platform account" });
    }
  });

  // Admin: Bulk auto-link all unlinked approved users to the platform
  app.post("/api/admin/users/bulk-link-platform", isAuthenticated, isAdmin, async (req, res) => {
    try {
      if (!MAIN_PLATFORM_URL || !MAIN_PLATFORM_API_KEY) {
        return res.status(400).json({ error: "Platform sync not configured." });
      }

      const allUsers = await storage.listUsers();
      const unlinked = allUsers.filter(u => u.approvalStatus === 'approved' && !u.platformUserId && u.email);

      let linked = 0;
      let failed = 0;
      const results: { email: string; status: string; platformUserId?: string }[] = [];

      for (const user of unlinked) {
        try {
          const apiUrl = `${MAIN_PLATFORM_URL}/api/external/event-requests/user-lookup?email=${encodeURIComponent(user.email!)}`;
          const response = await platformFetch(apiUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${MAIN_PLATFORM_API_KEY}`,
              'Content-Type': 'application/json',
            },
          });
          if (response.ok) {
            const data = await response.json();
            const platformUserId = data.data?.userId || data.userId;
            if (platformUserId) {
              await storage.updateUserSettings(user.id, { platformUserId });
              linked++;
              results.push({ email: user.email!, status: 'linked', platformUserId });
              continue;
            }
          }
          failed++;
          results.push({ email: user.email!, status: 'not_found' });
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
      if (!MAIN_PLATFORM_URL || !MAIN_PLATFORM_API_KEY) {
        return res.status(400).json({ 
          error: "Platform sync not configured." 
        });
      }

      const userId = getUserId(req);
      const user = await authStorage.getUser(userId!);
      if (!user?.email) {
        return res.status(400).json({ error: "No email address on your account. Cannot look up platform ID." });
      }

      const apiUrl = `${MAIN_PLATFORM_URL}/api/external/event-requests/user-lookup?email=${encodeURIComponent(user.email)}`;
      console.log(`Platform user lookup: ${apiUrl}`);

      const response = await platformFetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${MAIN_PLATFORM_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).json({ error: "No matching user found on the main platform for your email address." });
        }
        const errorText = await response.text();
        console.error(`Platform user lookup failed: ${response.status} - ${errorText}`);
        return res.status(response.status).json({ error: "Failed to look up platform user." });
      }

      const responseData = await response.json();
      const platformUserId = responseData.data?.userId || responseData.userId;

      if (!platformUserId) {
        return res.status(404).json({ error: "Could not find your platform user ID." });
      }

      await storage.updateUserSettings(userId!, { platformUserId });

      res.json({ success: true, platformUserId });
    } catch (error: any) {
      console.error('Platform user lookup error:', error);
      const isConnectionError = error.code === 'ECONNRESET' || error.message === 'fetch failed' || error.name === 'TimeoutError';
      const userMessage = isConnectionError
        ? "Could not reach the main platform (it may be starting up). Please try again in a few seconds."
        : "Failed to look up platform user ID.";
      res.status(500).json({ error: userMessage });
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

      // Sync status to main platform if this record was imported and status changed
      if (record?.externalEventId && MAIN_PLATFORM_URL && MAIN_PLATFORM_API_KEY) {
        const statusChanged = validated.status && validated.status !== existing.status;
        // Auto-notify platform when coordinator starts working (status moves from New → In Process)
        if (statusChanged && validated.status === 'In Process') {
          try {
            await platformFetch(`${MAIN_PLATFORM_URL}/api/external/event-requests/${record.externalEventId}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${MAIN_PLATFORM_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ status: 'in_process' }),
            });
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

      console.log(`Sync pull: User ${currentUser.email} has platformUserId: "${currentUser.platformUserId}"`);

      // Pull all active statuses so both apps stay in sync during transition
      const queryParams = new URLSearchParams({
        tspContact: currentUser.platformUserId,
        status: 'new,in_process,scheduled',
      });

      // Fetch event requests from main platform using the external API endpoint
      const apiUrl = `${MAIN_PLATFORM_URL}/api/external/event-requests?${queryParams.toString()}`;
      console.log(`Sync pull: Fetching from ${apiUrl}`);

      const response = await platformFetch(apiUrl, {
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

      const responseBody = await response.json();
      // Platform returns { success: true, data: [...], count: N }
      const eventRequests = Array.isArray(responseBody) ? responseBody : (responseBody.data || responseBody.eventRequests || []);
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

      for (const event of eventRequests) {
        const externalId = (event.id || event.eventRequestId)?.toString();
        const existing = externalId ? existingByExternalId.get(externalId) : null;

        // Platform uses camelCase: organizationName, firstName, lastName,
        // scheduledEventDate, estimatedSandwichCount, etc.
        const contactName = [event.firstName, event.lastName].filter(Boolean).join(' ') || event.contactName || 'Unknown Contact';
        const eventDateRaw = event.scheduledEventDate || event.eventDate || event.preferredDate;
        const platformStatus = event.status?.toLowerCase() || 'new';
        const localStatus = platformStatusToLocal[platformStatus] || 'New';

        if (existing) {
          // Update status from platform if it has advanced beyond the local status
          // (don't overwrite local progress with an older platform status)
          const statusRank: Record<string, number> = { 'New': 0, 'In Process': 1, 'Scheduled': 2, 'Completed': 3 };
          const platformRank = statusRank[localStatus] ?? 0;
          const localRank = statusRank[existing.status] ?? 0;

          if (platformRank > localRank) {
            await storage.updateIntakeRecord(existing.id, { status: localStatus });
            updatedCount++;
          }
        } else {
          // New record — import it
          await storage.createIntakeRecord({
            externalEventId: externalId,
            organizationName: event.organizationName || 'Unknown Org',
            contactName,
            contactEmail: event.contactEmail || event.email || '',
            contactPhone: event.contactPhone || event.phone || '',
            eventDate: eventDateRaw ? new Date(eventDateRaw) : null,
            eventTime: event.eventTime || event.preferredTime || '',
            location: event.location || event.address || event.eventLocation || '',
            attendeeCount: event.estimatedAttendees || event.attendeeCount || 0,
            sandwichCount: event.estimatedSandwichCount || event.sandwichCount || 0,
            dietaryRestrictions: event.dietaryRestrictions || event.dietaryNotes || '',
            requiresRefrigeration: event.requiresRefrigeration || false,
            hasIndoorSpace: event.hasIndoorSpace ?? true,
            hasRefrigeration: event.hasRefrigeration || false,
            deliveryInstructions: event.deliveryInstructions || event.specialInstructions || '',
            status: localStatus,
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
        total: eventRequests.length,
        message: `Imported ${importedCount} new, updated ${updatedCount} existing`
      });
    } catch (error: any) {
      console.error('Sync pull error:', error);
      const isConnectionError = error.code === 'ECONNRESET' || error.message === 'fetch failed' || error.name === 'TimeoutError';
      const userMessage = isConnectionError
        ? "Could not reach the main platform (it may be starting up). Please try again in a few seconds."
        : (error.message || "Sync failed");
      await storage.createSyncLog({
        direction: 'pull',
        recordCount: 0,
        status: 'error',
        error: error.message || 'Unknown error',
      });
      res.status(500).json({ error: userMessage });
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
      if (record.ownerId !== userId && currentUser?.role !== 'admin' && currentUser?.role !== 'admin_coordinator') {
        return res.status(403).json({ error: "You can only sync records assigned to you" });
      }

      // Push updates back to main platform using the external API endpoint
      const apiUrl = `${MAIN_PLATFORM_URL}/api/external/event-requests/${record.externalEventId}`;
      console.log(`Sync push: Updating ${apiUrl}`);
      
      const response = await platformFetch(apiUrl, {
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
          scheduledEventDate: record.eventDate,
          eventTime: record.eventTime,
          location: record.location,
          estimatedAttendees: record.attendeeCount,
          estimatedSandwichCount: record.sandwichCount,
          dietaryRestrictions: record.dietaryRestrictions,
          hasIndoorSpace: record.hasIndoorSpace,
          hasRefrigeration: record.hasRefrigeration,
          deliveryInstructions: record.deliveryInstructions,
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
