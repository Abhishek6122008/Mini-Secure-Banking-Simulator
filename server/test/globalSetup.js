import pg from 'pg';
import { runMigrations } from '../src/db/migrate.js';
import { ADMIN_URL, TEST_URL } from './env.js';

export default async function setup() {
  const name = new URL(TEST_URL).pathname.slice(1);
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  await runMigrations(TEST_URL);
}
