import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { newUser, testApp } from './helpers.js';

// Requirement 1 (account creation and login) and risk 5 (password guessing).
describe('registration and login', () => {
  const { app, pool } = testApp();

  it('gives a new user a unique 10-digit account ID and returns nothing else', async () => {
    const a = await request(app).post('/api/auth/register').send({ email: 'asha1@example.com', countryCode: '+91', phoneNumber: '9876543210', displayName: 'Asha', password: 'Pa55word!' });
    const b = await request(app).post('/api/auth/register').send({ email: 'asha2@example.com', countryCode: '+91', phoneNumber: '9876543211', displayName: 'Asha', password: 'Pa55word!' });
    expect(a.status).toBe(201);
    expect(a.body).toEqual({ accountId: expect.stringMatching(/^[1-9][0-9]{9}$/) });
    expect(b.body.accountId).not.toBe(a.body.accountId);
  });

  it('stores only an Argon2id hash of the password', async () => {
    const user = await newUser(app, 'Ravi', 'MySecret!9');
    const { rows } = await pool.query(
      'SELECT u.password_hash FROM users u JOIN accounts a ON a.owner_user_id = u.id WHERE a.account_id = $1',
      [user.accountId]);
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
    expect(rows[0].password_hash).not.toContain('MySecret!9');
  });

  it('allows login with the registered phone number', async () => {
    const user = await newUser(app);
    const login = await request(app).post('/api/auth/login').send({ phoneNumber: user.phoneNumber, password: user.password });
    expect(login.status).toBe(200);
    const byAccount = await request(app).post('/api/auth/login').send({ accountId: user.accountId, password: user.password });
    expect(byAccount.status).toBe(200);
  });

  it('gives the same generic error for a wrong password and for an account that does not exist', async () => {
    const user = await newUser(app);
    const wrongPassword = await request(app).post('/api/auth/login')
      .send({ phoneNumber: user.phoneNumber, password: 'not the password' });
    const noSuchAccount = await request(app).post('/api/auth/login')
      .send({ phoneNumber: '+911000000000', password: 'not the password' });
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
      .send({ email: 'greedy@example.com', countryCode: '+91', phoneNumber: '9876543212', displayName: 'Greedy', password: 'Pa55word!', balance: '99999999' });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ balance: 'Unexpected field' });
  });

  it('enforces length limits and refuses oversized bodies', async () => {
    const longName = await request(app).post('/api/auth/register')
      .send({ email: 'longname@example.com', countryCode: '+91', phoneNumber: '9876543213', displayName: 'x'.repeat(51), password: 'Pa55word!' });
    expect(longName.status).toBe(400);
    expect(longName.body.fields.displayName).toBe('Name must be at most 50 characters');

    const shortPassword = await request(app).post('/api/auth/register').send({ email: 'user1@example.com', countryCode: '+91', phoneNumber: '9876543214', displayName: 'A', password: 'short' });
    expect(shortPassword.body.fields.password).toBe('Password must be at least 8 characters');

    const weakPassword = await request(app).post('/api/auth/register').send({ email: 'user2@example.com', countryCode: '+91', phoneNumber: '9876543215', displayName: 'A', password: 'weakpass' });
    expect(weakPassword.status).toBe(400);
    expect(weakPassword.body.fields.password).toContain('uppercase');

    const missingPassword = await request(app).post('/api/auth/register')
      .send({ email: 'user3@example.com', countryCode: '+91', phoneNumber: '9876543216', displayName: 'A' });
    expect(missingPassword.status).toBe(400);
    expect(missingPassword.body.fields.password).toBeDefined();

    const missingEmail = await request(app).post('/api/auth/register')
      .send({ countryCode: '+91', phoneNumber: '9876543218', displayName: 'A', password: 'StrongPass!9' });
    expect(missingEmail.status).toBe(400);
    expect(missingEmail.body.fields.email).toBeDefined();

    const huge = await request(app).post('/api/auth/register').set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'user4@example.com', countryCode: '+91', phoneNumber: '9876543217', displayName: 'A', password: 'P'.repeat(20_000) }));
    expect(huge.status).toBe(413);
  });

  it('answers malformed JSON with a plain 400, not a stack trace', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"phoneNumber":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Malformed JSON' });
  });
});
