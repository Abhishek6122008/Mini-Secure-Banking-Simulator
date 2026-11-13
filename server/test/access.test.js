import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { newUser, SECRET, send, testApp } from './helpers.js';

// Requirement 3 (account and history privacy), risks 1 (unauthorized access) and 6 (stolen or invalid tokens).
describe('who can see what', () => {
  const { app } = testApp();

  it('lets visitors reach only registration and login', async () => {
    for (const path of ['/api/account', '/api/transactions']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Authentication required' });
    }
    expect((await request(app).post('/api/transfers').send({})).status).toBe(401);
  });

  it('refuses forged, expired, unsigned and wrong-audience tokens', async () => {
    const user = await newUser(app);
    const sub = JSON.parse(Buffer.from(user.token.split('.')[1], 'base64url').toString()).sub;
    const tokens = {
      forged: jwt.sign({}, 'some-other-secret-'.padEnd(48, 'y'), { subject: sub, issuer: 'msbs', audience: 'msbs-api' }),
      expired: jwt.sign({}, SECRET, { subject: sub, issuer: 'msbs', audience: 'msbs-api', expiresIn: -10 }),
      wrongAudience: jwt.sign({}, SECRET, { subject: sub, issuer: 'msbs', audience: 'someone-else' }),
      unsigned: `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${
        Buffer.from(JSON.stringify({ sub, iss: 'msbs', aud: 'msbs-api' })).toString('base64url')}.`,
    };
    for (const [kind, token] of Object.entries(tokens)) {
      const res = await request(app).get('/api/account').set('Authorization', `Bearer ${token}`);
      expect(res.status, kind).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid or expired session' });
    }
  });

  it('shows a user their own account only, whatever ID they put in the request', async () => {
    const asha = await newUser(app, 'Asha');
    const ravi = await newUser(app, 'Ravi');
    // There is no route that takes an account ID to read: query strings and paths with Ravi's ID change nothing.
    const mine = await request(app).get(`/api/account?accountId=${ravi.accountId}`).set(asha.auth);
    expect(mine.body).toMatchObject({ accountId: asha.accountId, displayName: 'Asha' });
    expect((await request(app).get(`/api/account/${ravi.accountId}`).set(asha.auth)).status).toBe(404);
  });

  it('shows each user only the transfers they took part in', async () => {
    const asha = await newUser(app, 'Asha');
    const ravi = await newUser(app, 'Ravi');
    const meera = await newUser(app, 'Meera');
    await send(app, asha, ravi, 2500).expect(201);

    const ravis = await request(app).get('/api/transactions').set(ravi.auth).expect(200);
    expect(ravis.body.items).toEqual([expect.objectContaining({
      direction: 'received', counterpartyAccountId: asha.accountId, amount: '2500' })]);
    // The receiver learns the sender's account ID and nothing else about them.
    expect(Object.keys(ravis.body.items[0]).sort()).toEqual(
      ['amount', 'counterpartyAccountId', 'createdAt', 'direction', 'id']);

    const meeras = await request(app).get('/api/transactions').set(meera.auth).expect(200);
    expect(meeras.body.items).toEqual([]);
  });

  it('returns history in pages, at most 50 at a time', async () => {
    const asha = await newUser(app);
    const ravi = await newUser(app);
    for (let i = 1; i <= 5; i++) await send(app, asha, ravi, i).expect(201);

    const first = await request(app).get('/api/transactions?limit=2').set(asha.auth).expect(200);
    expect(first.body.items.map((t) => t.amount)).toEqual(['5', '4']);
    const second = await request(app).get(`/api/transactions?limit=2&before=${first.body.nextCursor}`)
      .set(asha.auth).expect(200);
    expect(second.body.items.map((t) => t.amount)).toEqual(['3', '2']);

    const tooMany = await request(app).get('/api/transactions?limit=1000').set(asha.auth);
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.fields.limit).toBe('At most 50 per page');
  });
});
