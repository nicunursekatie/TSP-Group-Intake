import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { authStorage } from "./storage";
import { pool } from "../../db";

const SALT_ROUNDS = 10;

export function getSession() {
  const sessionTtl = 30 * 24 * 60 * 60 * 1000; // 30 days
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    pool: pool,               // Share the existing pool — no duplicate connections
    createTableIfMissing: false,
    ttl: sessionTtl / 1000,
    tableName: "sessions",
  });

  const isProduction = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1';

  return session({
    secret: process.env.SESSION_SECRET || 'tsp-intake-dev-secret',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    name: 'tsp.intake.session',
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' as const : 'lax' as const,
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  // POST /api/auth/login — email + password login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email) {
        return res.status(400).json({ success: false, message: "Email is required" });
      }

      // Find user by email
      const user = await authStorage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ success: false, message: "Invalid email or password" });
      }

      // Check if user is active
      if (user.isActive === false) {
        return res.status(403).json({
          success: false,
          code: "PENDING_APPROVAL",
          message: "Your account is pending approval.",
        });
      }

      // Check if user needs password setup (no password set yet)
      if (!user.password) {
        return res.status(403).json({
          success: false,
          code: "NO_PASSWORD",
          message: "No password is set for this account. Please contact an administrator.",
        });
      }

      if (!password) {
        return res.status(400).json({ success: false, message: "Password is required" });
      }

      // Verify bcrypt password
      if (!user.password.startsWith('$2b$') && !user.password.startsWith('$2a$')) {
        return res.status(403).json({
          success: false,
          code: "PASSWORD_RESET_REQUIRED",
          message: "Your password must be reset. Please contact an administrator.",
        });
      }

      const isValid = await bcrypt.compare(password.trim(), user.password);
      if (!isValid) {
        return res.status(401).json({ success: false, message: "Invalid email or password" });
      }

      // Save user info in session
      (req.session as any).userId = user.id;

      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ success: false, message: "Failed to create session" });
        }
        return res.json({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            approvalStatus: user.approvalStatus,
          },
        });
      });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({
        success: false,
        message: "An error occurred during login",
        detail: error?.message,
      });
    }
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
        return res.status(500).json({ success: false, message: "Failed to logout" });
      }
      res.clearCookie('tsp.intake.session');
      return res.json({ success: true, message: "Logged out successfully" });
    });
  });

  // GET /api/logout — redirect-based logout (for links)
  app.get("/api/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) console.error("Session destroy error:", err);
      res.clearCookie('tsp.intake.session');
      res.redirect("/");
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const userId = (req.session as any)?.userId;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Fetch fresh user data to ensure the user still exists
  const user = await authStorage.getUser(userId);
  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Attach user to request for downstream use
  (req as any).dbUser = user;

  next();
};

// Utility: hash a password
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain.trim(), SALT_ROUNDS);
}
