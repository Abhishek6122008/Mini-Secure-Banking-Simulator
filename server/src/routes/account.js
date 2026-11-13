import { and, desc, eq, lt, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Router } from 'express';
import { accounts, transactions, users } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { validateQuery } from '../middleware/validate.js';
import { historySchema } from '../schemas.js';

// The logged-in user's own account. Every query is keyed by the user ID from the verified token; none of these routes
// takes an account ID from the request, so there is no ID to swap for someone else's.
export async function ownAccount(db, userId) {
  const [account] = await db.select().from(accounts).where(eq(accounts.ownerUserId, userId));
  if (!account) throw new HttpError(401, 'Invalid or expired session');
  return account;
}

export function accountRoutes({ db }) {
  const router = Router();

  router.get('/account', async (req, res) => {
    const [row] = await db.select({
      accountId: accounts.accountId,
      balance: accounts.balance,
      createdAt: accounts.createdAt,
      displayName: users.displayName,
    }).from(accounts).innerJoin(users, eq(users.id, accounts.ownerUserId)).where(eq(accounts.ownerUserId, req.userId));
    if (!row) throw new HttpError(401, 'Invalid or expired session');
    res.json({ ...row, balance: row.balance.toString() });
  });

  // History in pages of at most HISTORY_MAX_PAGE, newest first. Only transfers this account sent or received, and
  // only the other side's account ID: never its owner's name, balance or history.
  router.get('/transactions', validateQuery(historySchema), async (req, res) => {
    const { limit, before } = req.validQuery;
    const mine = await ownAccount(db, req.userId);
    const sender = alias(accounts, 'sender');
    const receiver = alias(accounts, 'receiver');
    const involvesMe = or(eq(transactions.senderAccountId, mine.id), eq(transactions.receiverAccountId, mine.id));
    const rows = await db.select({
      id: transactions.id,
      amount: transactions.amount,
      createdAt: transactions.createdAt,
      senderId: transactions.senderAccountId,
      senderAccountId: sender.accountId,
      receiverAccountId: receiver.accountId,
    }).from(transactions)
      .innerJoin(sender, eq(sender.id, transactions.senderAccountId))
      .innerJoin(receiver, eq(receiver.id, transactions.receiverAccountId))
      .where(before ? and(involvesMe, lt(transactions.id, before)) : involvesMe)
      .orderBy(desc(transactions.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    res.json({
      items: page.map((t) => {
        const sent = t.senderId === mine.id;
        return {
          id: t.id,
          direction: sent ? 'sent' : 'received',
          counterpartyAccountId: sent ? t.receiverAccountId : t.senderAccountId,
          amount: t.amount.toString(),
          createdAt: t.createdAt,
        };
      }),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    });
  });

  return router;
}
