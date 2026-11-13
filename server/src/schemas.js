import { z } from 'zod';
import { HISTORY_MAX_PAGE, MAX_TRANSFER } from './config.js';

const accountId = z.string().regex(/^[1-9][0-9]{9}$/, 'Account ID is 10 digits');
const password = z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password is too long');

export const registerSchema = z.strictObject({
  displayName: z.string().trim()
    .min(1, 'Name is required')
    .max(50, 'Name must be at most 50 characters')
    .regex(/^[^\p{C}]+$/u, 'Name contains invalid characters'),
  password,
});

export const loginSchema = z.strictObject({
  accountId,
  password: z.string().min(1, 'Password is required').max(128, 'Password is too long'),
});

// Amounts are whole paise as a decimal string: no sign, no fraction, no exponent, no leading zero, and at most the
// transfer limit. So -500, 0, 12.5, 1e3 and 999999999999999999 are all refused, and nothing is ever rounded.
const WHOLE_PAISE = /^[1-9][0-9]{0,17}$/;

export const transferSchema = z.strictObject({
  toAccountId: accountId,
  amount: z.string()
    .regex(WHOLE_PAISE, 'Amount must be a whole number of paise, greater than 0')
    // Zod 4 runs this even when the regex failed, so it must not assume a valid number (BigInt('12.5') throws).
    .refine((v) => !WHOLE_PAISE.test(v) || BigInt(v) <= MAX_TRANSFER, `Amount must be at most ${MAX_TRANSFER} paise`),
  requestKey: z.uuid('Request key must be a UUID'),
});

export const historySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(HISTORY_MAX_PAGE, `At most ${HISTORY_MAX_PAGE} per page`).default(20),
  before: z.coerce.number().int().positive().optional(),
});
