import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

// Works with any PostgreSQL, Supabase included: point DATABASE_URL at Supabase's connection string.
export function createDb(databaseUrl) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  return { db: drizzle(pool, { schema }), pool };
}
