import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { balanceOf, newUser, send, testApp } from './helpers.js';

const START = 1_000_000n; // every new account starts with ₹10,000.00, in paise

// Requirements 4 and 5, risks 2 (invalid amounts), 3 (duplicates), 4 (partial or simultaneous transfers),
// 9 (altered history).
describe('transfers', () => {
  const { app, pool } = testApp();

  it('moves the money and records it for both sides', async () => {
    const asha = await newUser(app);
    const ravi = await newUser(app);
    const res = await send(app, asha, ravi, 12_345).expect(201);
    expect(res.body.transfer).toMatchObject({ fromAccountId: asha.accountId, toAccountId: ravi.accountId, amount: '12345' });
    expect(await balanceOf(app, asha)).toBe(START - 12_345n);
    expect(await balanceOf(app, ravi)).toBe(START + 12_345n);
  });

  it('sends to a recipient by phone number', async () => {
    const sender = await newUser(app);
    const recipient = await newUser(app);
    const result = await request(app).post('/api/transfers').set(sender.auth)
      .send({ recipient: recipient.phoneNumber, amount: '500', requestKey: randomUUID() }).expect(201);
    expect(result.body.transfer.toAccountId).toBe(recipient.accountId);
  });

  it('refuses invalid amounts, including -500 and 999999999999999999, and changes nothing', async () => {
    const asha = await newUser(app);
    const ravi = await newUser(app);
    for (const amount of ['-500', '0', '999999999999999999', '12.5', '1e3', '007', ' 5', '', '10000001']) {
      const res = await send(app, asha, ravi, amount);
      expect(res.status, `amount ${JSON.stringify(amount)}`).toBe(400);
      expect(res.body.fields.amount).toBeDefined();
    }
    // Numbers are refused too: JavaScript would round large ones before the server ever saw them.
    const numeric = await request(app).post('/api/transfers').set(asha.auth)
      .send({ recipient: ravi.accountId, amount: 500, requestKey: randomUUID() });
    expect(numeric.status).toBe(400);
    expect(await balanceOf(app, asha)).toBe(START);
    expect(await balanceOf(app, ravi)).toBe(START);
  });

  it('refuses a transfer beyond the balance, to oneself, or to an unknown account', async () => {
    const asha = await newUser(app);
    const ravi = await newUser(app);
    expect((await send(app, asha, ravi, START + 1n)).body).toEqual({ error: 'Insufficient funds' });
    expect((await send(app, asha, asha, 100)).body).toEqual({ error: 'You cannot transfer to your own account' });
    expect((await send(app, asha, { accountId: '1000000000' }, 100)).status).toBe(404);
    expect(await balanceOf(app, asha)).toBe(START);
  });

  it('takes the sender from the login, never from the request', async () => {
    const asha = await newUser(app);
    const ravi = await newUser(app);
    const res = await request(app).post('/api/transfers').set(asha.auth)
      .send({ fromAccountId: ravi.accountId, recipient: asha.accountId, amount: '100', requestKey: randomUUID() });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual({ fromAccountId: 'Unexpected field' });
    expect(await balanceOf(app, ravi)).toBe(START);
  });

  it('processes a retried request once (same request key)', async () => {
    const asha = await newUser(app);
    const ravi = await newUser(app);
    const key = randomUUID();
    const first = await send(app, asha, ravi, 700, key).expect(201);
    const retry = await send(app, asha, ravi, 700, key).expect(200);
    expect(retry.body).toEqual({ transfer: first.body.transfer, replayed: true });
    expect(await balanceOf(app, asha)).toBe(START - 700n);

    const reused = await send(app, asha, ravi, 900, key);
    expect(reused.status).toBe(409);
  });

  it('processes ten simultaneous copies of one request exactly once', async () => {
    const asha = await newUser(app);
    const ravi = await newUser(app);
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 10 }, () => send(app, asha, ravi, 1_000, key)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 200)).toHaveLength(9);
    expect(await balanceOf(app, asha)).toBe(START - 1_000n);
  });

  it('never overdraws under simultaneous transfers, and history matches the balances', async () => {
    const asha = await newUser(app);
    const ravi = await newUser(app);
    const meera = await newUser(app);
    // 20 transfers of ₹1,000 at once from a ₹10,000 balance: exactly 10 can succeed.
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      send(app, asha, i % 2 ? ravi : meera, 100_000)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(10);
    expect(results.filter((r) => r.status === 422)).toHaveLength(10);
    expect(await balanceOf(app, asha)).toBe(0n);
    const total = (await balanceOf(app, ravi)) + (await balanceOf(app, meera));
    expect(total).toBe(2n * START + START);

    const history = await request(app).get('/api/transactions?limit=50').set(asha.auth).expect(200);
    const sent = history.body.items.reduce((sum, t) => sum + BigInt(t.amount), 0n);
    expect(sent).toBe(START);
  });

  it('keeps history immutable, even for direct database access', async () => {
    const asha = await newUser(app);
    const ravi = await newUser(app);
    const { transfer } = (await send(app, asha, ravi, 50).expect(201)).body;
    await expect(pool.query('UPDATE transactions SET amount = 1 WHERE id = $1', [transfer.id]))
      .rejects.toThrow('transactions are immutable');
    await expect(pool.query('DELETE FROM transactions WHERE id = $1', [transfer.id]))
      .rejects.toThrow('transactions are immutable');
  });

  it('has database checks that hold even if the API had a bug', async () => {
    await expect(pool.query("UPDATE accounts SET balance = -1 WHERE account_id IS NOT NULL"))
      .rejects.toThrow(/accounts_balance_range/);
  });
});
