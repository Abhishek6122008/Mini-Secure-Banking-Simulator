import { sql } from 'drizzle-orm';
import { bigint, check, index, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { MAX_BALANCE, MAX_TRANSFER } from '../config.js';

// The database enforces the money rules itself, so a bug in the API can't break them: balances stay between 0 and the
// maximum, amounts are positive and capped, nobody pays themselves, and one sender can't reuse a request key.
// Row Level Security is on with no policies, so Supabase's public API roles can read nothing; only the server, which
// connects as the table owner, can reach the data.

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: varchar('display_name', { length: 50 }).notNull(),
  username: varchar('username', { length: 30 }).notNull().unique(),
  phoneNumber: varchar('phone_number', { length: 16 }).unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerUserId: uuid('owner_user_id').notNull().unique().references(() => users.id, { onDelete: 'restrict' }),
  accountId: varchar('account_id', { length: 10 }).notNull().unique(),
  balance: bigint('balance', { mode: 'bigint' }).notNull().default(sql`0`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('accounts_account_id_format', sql`${t.accountId} ~ '^[1-9][0-9]{9}$'`),
  check('accounts_balance_range', sql`${t.balance} >= 0 AND ${t.balance} <= ${sql.raw(MAX_BALANCE.toString())}`),
]).enableRLS();

export const transactions = pgTable('transactions', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  senderAccountId: uuid('sender_account_id').notNull().references(() => accounts.id, { onDelete: 'restrict' }),
  receiverAccountId: uuid('receiver_account_id').notNull().references(() => accounts.id, { onDelete: 'restrict' }),
  amount: bigint('amount', { mode: 'bigint' }).notNull(),
  requestKey: uuid('request_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('transactions_sender_request_key').on(t.senderAccountId, t.requestKey),
  check('transactions_amount_range', sql`${t.amount} > 0 AND ${t.amount} <= ${sql.raw(MAX_TRANSFER.toString())}`),
  check('transactions_not_to_self', sql`${t.senderAccountId} <> ${t.receiverAccountId}`),
  index('transactions_sender_idx').on(t.senderAccountId, t.id),
  index('transactions_receiver_idx').on(t.receiverAccountId, t.id),
]).enableRLS();
