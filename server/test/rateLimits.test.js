import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { newUser, send, testApp } from './helpers.js';

// Requirement 2 (rate limiting), risk 5 (password guessing).
describe('rate limits', () => {
  const { app } = testApp({ failedLoginsPer15Min: 3, transfersPerMinute: 3 });

  it('stops password guessing after a few failures, even if the next guess is right', async () => {
    const user = await newUser(app);
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/auth/login').send({ phoneNumber: user.phoneNumber, password: `guess ${i}` }).expect(401);
    }
    const blocked = await request(app).post('/api/auth/login')
      .send({ phoneNumber: user.phoneNumber, password: user.password });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: 'Too many requests, try again later' });
  });

  it('does not count successful logins as failures', async () => {
    const user = await newUser(app);
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ phoneNumber: user.phoneNumber, password: user.password }).expect(200);
    }
  });

  it('limits how many transfers one user can send per minute', async () => {
    const asha = await newUser(app);
    const ravi = await newUser(app);
    for (let i = 0; i < 3; i++) await send(app, asha, ravi, 1).expect(201);
    expect((await send(app, asha, ravi, 1)).status).toBe(429);
    // Another user has their own allowance.
    await send(app, ravi, asha, 1).expect(201);
  });
});
