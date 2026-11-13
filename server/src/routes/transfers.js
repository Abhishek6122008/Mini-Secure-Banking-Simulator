import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { Router } from 'express';
import { MAX_BALANCE } from '../config.js';
import { accounts, transactions } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { validateBody } from '../middleware/validate.js';
import { transferSchema } from '../schemas.js';
import { ownAccount } from './account.js';

const UNIQUE_VIOLATION = '23505';

function view(transfer, fromAccountId, toAccountId) {
  return { id: transfer.id, fromAccountId, toAccountId, amount: transfer.amount.toString(), createdAt: transfer.createdAt };
}

// Moves money between two accounts as one database transaction: lock both rows, check the funds, debit, credit and
// record the transfer, or change nothing at all. The sender is the logged-in user, never a field in the body.
// requestKey makes retries safe: the same key from the same sender returns the first transfer instead of a second one.
export async function transfer(db, userId, { toAccountId, amount, requestKey }) {
  const value = BigInt(amount);
  return db.transaction(async (tx) => {
    const sender = await ownAccount(tx, userId);
    const [receiver] = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.accountId, toAccountId));
    if (!receiver) throw new HttpError(404, 'Receiver account not found');
    if (receiver.id === sender.id) throw new HttpError(400, 'You cannot transfer to your own account');

    // Lock both accounts in a fixed order (by id) so two opposite transfers can't deadlock. Everything below reads
    // the locked, current balances.
    const locked = await tx.select().from(accounts)
      .where(inArray(accounts.id, [sender.id, receiver.id])).orderBy(asc(accounts.id)).for('update');
    const from = locked.find((a) => a.id === sender.id);
    const to = locked.find((a) => a.id === receiver.id);

    // Checked after the lock, so a duplicate request that waited for the first one sees it here.
    const [previous] = await tx.select().from(transactions)
      .where(and(eq(transactions.senderAccountId, from.id), eq(transactions.requestKey, requestKey)));
    if (previous) {
      if (previous.receiverAccountId !== to.id || previous.amount !== value) {
        throw new HttpError(409, 'This request key was already used for a different transfer');
      }
      return { transfer: view(previous, from.accountId, toAccountId), replayed: true };
    }

    if (from.balance < value) throw new HttpError(422, 'Insufficient funds');
    if (to.balance + value > MAX_BALANCE) throw new HttpError(422, 'The receiver cannot accept this amount');

    await tx.update(accounts).set({ balance: sql`${accounts.balance} - ${value}` }).where(eq(accounts.id, from.id));
    await tx.update(accounts).set({ balance: sql`${accounts.balance} + ${value}` }).where(eq(accounts.id, to.id));
    const [created] = await tx.insert(transactions)
      .values({ senderAccountId: from.id, receiverAccountId: to.id, amount: value, requestKey })
      .returning();
    return { transfer: view(created, from.accountId, toAccountId), replayed: false };
  });
}

export function transferRoutes({ db, limits }) {
  const router = Router();
  router.post('/transfers', limits.transfer, validateBody(transferSchema), async (req, res) => {
    let result;
    try {
      result = await transfer(db, req.userId, req.body);
    } catch (err) {
      // Two identical requests at the same instant: the database's unique key stopped the second; answer with the first.
      if (err.cause?.code !== UNIQUE_VIOLATION && err.code !== UNIQUE_VIOLATION) throw err;
      result = await transfer(db, req.userId, req.body);
    }
    // Success is reported only after the transaction has committed.
    res.status(result.replayed ? 200 : 201).json(result);
  });
  return router;
}
