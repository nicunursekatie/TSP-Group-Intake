import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// ── Startup diagnostic: log which endpoint we're actually connecting to ──
const dbUrl = process.env.DATABASE_URL;
try {
  const parsed = new URL(dbUrl);
  console.log(`[DB] Connecting to host: ${parsed.hostname}`);
  console.log(`[DB] Database name: ${parsed.pathname.replace('/', '')}`);
  console.log(`[DB] Using SSL: ${parsed.searchParams.get('sslmode') || 'default'}`);
} catch {
  console.log(`[DB] Could not parse DATABASE_URL — raw prefix: ${dbUrl.substring(0, 30)}...`);
}

export const pool = new Pool({
  connectionString: dbUrl,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10,
});

// Handle unexpected pool errors so they don't crash the process
pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err);
});

export const db = drizzle({ client: pool, schema });

// Test connection at startup — logs result, doesn't block the app
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT current_database(), current_user, version()');
    const row = result.rows[0];
    console.log(`[DB] ✓ Connected — db="${row.current_database}" user="${row.current_user}"`);
    console.log(`[DB] ✓ Postgres version: ${row.version?.split(',')[0]}`);
    client.release();
    return true;
  } catch (err: any) {
    console.error(`[DB] ✗ Connection test FAILED: ${err.message}`);
    console.error(`[DB] ✗ Full error:`, err);
    return false;
  }
}
