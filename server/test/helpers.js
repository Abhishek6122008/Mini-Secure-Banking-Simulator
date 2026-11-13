import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db/client.js';
import { TEST_URL } from './env.js';

export const SECRET = 'test-only-secret-'.padEnd(48, 'x');

export function testApp(limits = {}) {
  const { db, pool } = createDb(TEST_URL);
  afterAll(() => pool.end());
  const config = {
    databaseUrl: TEST_URL,
    jwtSecret: SECRET,
    jwtLifetimeSeconds: 900,
    trustProxy: false,
    limits: { registerPerHour: 1000, loginPer15Min: 1000, failedLoginsPer15Min: 1000, transfersPerMinute: 1000, ...limits },
  };
  return { app: createApp({ db, config }), db, pool };
}

// Registers and logs in a new user: every test works with its own accounts, so tests never share balances.
export async function newUser(app, displayName = 'Test User', password = 'correct horse battery') {
  const registered = await request(app).post('/api/auth/register').send({ displayName, password }).expect(201);
  const { accountId } = registered.body;
  const login = await request(app).post('/api/auth/login').send({ accountId, password }).expect(200);
  return { accountId, password, token: login.body.token, auth: { Authorization: `Bearer ${login.body.token}` } };
}

export async function balanceOf(app, user) {
  const res = await request(app).get('/api/account').set(user.auth).expect(200);
  return BigInt(res.body.balance);
}

export function send(app, from, to, amount, requestKey = randomUUID()) {
  return request(app).post('/api/transfers').set(from.auth)
    .send({ toAccountId: to.accountId, amount: String(amount), requestKey });
}
