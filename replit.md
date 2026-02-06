# The Sandwich Project - Intake Portal

## Overview

This is an event intake workflow and management application for The Sandwich Project (TSP), a nonprofit organization. The app allows volunteers and admins to manage event intake requests — tracking sandwich orders, event logistics, scheduling, task management, and coordination with an external main platform.

The application follows a full-stack TypeScript architecture with a React frontend (Vite), Express backend, and PostgreSQL database using Drizzle ORM. Authentication is handled through Replit's OpenID Connect (OIDC) integration with a user approval workflow.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (client/)
- **Framework**: React 18 with TypeScript, built with Vite
- **Routing**: Wouter (lightweight alternative to React Router)
- **State Management**: TanStack React Query for server state, Zustand for local state (`client/src/lib/store.ts`)
- **UI Components**: shadcn/ui (new-york style) with Radix UI primitives, Tailwind CSS v4 with CSS variables for theming
- **Forms**: React Hook Form with Zod validation via `@hookform/resolvers`
- **Notifications**: Sonner toast library alongside shadcn toast
- **Path aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Key Frontend Pages
- **Landing Page** (`/`) — Public marketing page with login CTA
- **Dashboard** — Lists all intake records with search/filter, sync button for external platform
- **Intake Page** (`/intake/:id`) — Detailed form with task sidebar for managing individual intake records
- **Admin Page** — User approval and role management (admin-only)
- **Settings Page** — User notification preferences (SMS, email), phone number, platform user ID
- **Pending Approval** — Shown to unapproved users after login

### Backend (server/)
- **Framework**: Express.js on Node.js with TypeScript (tsx runner)
- **API Pattern**: RESTful JSON API under `/api/` prefix
- **Build**: esbuild for server bundling, Vite for client bundling (see `script/build.ts`)
- **Development**: Vite dev server with HMR proxied through Express (`server/vite.ts`)
- **Production**: Static file serving from `dist/public` (`server/static.ts`)

### Authentication & Authorization
- **Auth Provider**: Replit OIDC (OpenID Connect) via `openid-client` and Passport.js
- **Session Storage**: PostgreSQL-backed sessions via `connect-pg-simple`
- **User Approval Workflow**: First user auto-approved as admin; subsequent users require admin approval
- **Roles**: `pending`, `volunteer`, `admin`
- **Middleware**: `isAuthenticated` (checks login), `isApproved` (checks approval status), `isAdmin` (checks admin role)
- **Auth files**: `server/replit_integrations/auth/` directory contains all auth logic

### Database
- **Database**: PostgreSQL (required, connection via `DATABASE_URL` env var)
- **ORM**: Drizzle ORM with `drizzle-kit` for migrations
- **Schema Location**: `shared/schema.ts` (main) and `shared/models/auth.ts` (auth tables)
- **Key Tables**:
  - `users` — User accounts with roles, approval status, notification preferences
  - `sessions` — Express session storage (mandatory for Replit Auth)
  - `intake_records` — Event intake records with organization info, event details, sandwich logistics, status, flags
  - `tasks` — Tasks linked to intake records with due dates and completion tracking
  - `platform_sync_log` — Logs for syncing with external platform
- **Push command**: `npm run db:push` (uses drizzle-kit push)

### Storage Layer
- `server/storage.ts` defines `IStorage` interface with methods for users, intake records, tasks, and sync logs
- Database operations use Drizzle query builder with the shared schema

### External Services
- **SendGrid** (`server/services/sendgrid.ts`) — Email notifications via Replit's SendGrid connector integration
- **Twilio** (`server/services/twilio.ts`) — SMS alerts via Replit's Twilio connector integration
- **Main Platform Sync** — External platform integration configured via `MAIN_PLATFORM_URL` and `MAIN_PLATFORM_API_KEY` environment variables

### Environment Variables Required
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Express session secret
- `ISSUER_URL` — OIDC issuer (defaults to `https://replit.com/oidc`)
- `REPL_ID` — Replit environment identifier
- `MAIN_PLATFORM_URL` — External platform API URL (optional)
- `MAIN_PLATFORM_API_KEY` — External platform API key (optional)
- Replit connector env vars for SendGrid and Twilio (managed by Replit)

### Build & Development
- `npm run dev` — Starts development server with Vite HMR on port 5000
- `npm run build` — Builds client (Vite) and server (esbuild) to `dist/`
- `npm start` — Runs production build from `dist/index.cjs`
- `npm run db:push` — Pushes schema changes to database

## External Dependencies

- **PostgreSQL** — Primary data store (provisioned via Replit)
- **Replit Auth (OIDC)** — User authentication via Replit's OpenID Connect provider
- **SendGrid** — Email delivery service (via Replit connector)
- **Twilio** — SMS messaging service (via Replit connector)
- **External Main Platform** — Custom API integration for syncing event data (configurable via env vars)
- **Google Fonts** — Inter and Poppins font families loaded via CDN