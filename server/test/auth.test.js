import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { newUser, testApp } from './helpers.js';

// Requirement 1 (account creation and login) and risk 5 (password guessing).
describe('registration and login', () => {
  const { app, pool } = testApp();

  it('gives a new user a unique 10-digit account ID and returns nothing else', async () => {
    const a = await request(app).post('/api/auth/register').send({ displayName: 'Asha', password: 'pa55word!' });
    const b = await request(app).post('/api/auth/register').send({ displayName: 'Asha', password: 'pa55word!' });
    expect(a.status).toBe(201);
    expect(a.body).toEqual({ accountId: expect.stringMatching(/^[1-9][0-9]{9}$/) });
    expect(b.body.accountId).not.toBe(a.body.accountId);
  });

  it('stores only an Argon2id hash of the password', async () => {
    const user = await newUser(app, 'Ravi', 'my secret password');
    const { rows } = await pool.query(
      'SELECT u.password_hash FROM users u JOIN accounts a ON a.owner_user_id = u.id WHERE a.account_id = $1',
      [user.accountId]);
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
    expect(rows[0].password_hash).not.toContain('my secret password');
  });

  it('gives the same generic error for a wrong password and for an account that does not exist', async () => {
    const user = await newUser(app);
    const wrongPassword = await request(app).post('/api/auth/login')
      .send({ accountId: user.accountId, password: 'not the password' });
    const noSuchAccount = await request(app).post('/api/auth/login')
      .send({ accountId: '1000000000', password: 'not the password' });
    expect(wrongPassword.status).toBe(401);
    expect(noSuchAccount.status).toBe(401);
    expect(wrongPassword.body).toEqual({ error: 'Invalid credentials' });
    expect(noSuchAccount.body).toEqual(wrongPassword.body);
  });

  it('issues a short-lived token for the user, not for the account ID they typed', async () => {
    const user = await newUser(app);
    const claims = JSON.parse(Buffer.from(user.token.split('.')[1], 'base64url').toString());
    expect(claims.sub).toMatch(/^[0-9a-f-]{36}$/);
    expect(claims.exp - claims.iat).toBe(900);
  });

  it('rejects fields it does not expect, such as a starting balance', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ displayName: 'Greedy', password: 'pa55word!', balance: '99999999' });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ balance: 'Unexpected field' });
  });

  it('enforces length limits and refuses oversized bodies', async () => {
    const longName = await request(app).post('/api/auth/register')
      .send({ displayName: 'x'.repeat(51), password: 'pa55word!' });
    expect(longName.status).toBe(400);
    expect(longName.body.fields.displayName).toBe('Name must be at most 50 characters');

    const shortPassword = await request(app).post('/api/auth/register').send({ displayName: 'A', password: 'short' });
    expect(shortPassword.body.fields.password).toBe('Password must be at least 8 characters');

    const huge = await request(app).post('/api/auth/register').set('Content-Type', 'application/json')
      .send(JSON.stringify({ displayName: 'A', password: 'p'.repeat(20_000) }));
    expect(huge.status).toBe(413);
  });

  it('answers malformed JSON with a plain 400, not a stack trace', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"accountId":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Malformed JSON' });
  });
});
