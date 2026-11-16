import { z } from 'zod';
import { HISTORY_MAX_PAGE, MAX_TRANSFER } from './config.js';

const accountId = z.string().regex(/^[1-9][0-9]{9}$/, 'Account ID is 10 digits');
const password = z.string().min(8, 'Password must be at least 8 characters').max(16, 'Password must be at most 16 characters')
  .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
  .regex(/[a-z]/, 'Password must include at least one lowercase letter')
  .regex(/[0-9]/, 'Password must include at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must include at least one special symbol');

export const registerSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254, 'Email must be at most 254 characters'),
  countryCode: z.string().regex(/^\+[1-9][0-9]{0,2}$/, 'Choose a valid country calling code'),
  phoneNumber: z.string().regex(/^[0-9]{10}$/, 'Phone number must be exactly 10 digits'),
  displayName: z.string().trim()
    .min(1, 'Name is required')
    .max(50, 'Name must be at most 50 characters')
    .regex(/^[^\p{C}]+$/u, 'Name contains invalid characters'),
  password,
});

const loginPassword = z.string().min(1, 'Password is required').max(16, 'Password must be at most 16 characters');
export const loginSchema = z.union([
  z.strictObject({ phoneNumber: z.string().regex(/^\+[1-9][0-9]{9,14}$/, 'Enter a valid phone number with country code'), password: loginPassword }),
  z.strictObject({ accountId: z.string().regex(/^[1-9][0-9]{9}$/, 'Account number must be 10 digits'), password: loginPassword }),
]);

// Amounts are whole paise as a decimal string: no sign, no fraction, no exponent, no leading zero, and at most the
// transfer limit. So -500, 0, 12.5, 1e3 and 999999999999999999 are all refused, and nothing is ever rounded.
const WHOLE_PAISE = /^[1-9][0-9]{0,17}$/;

export const transferSchema = z.strictObject({
  recipient: z.string().trim().min(1, 'Enter a receiver account ID or phone number').max(16, 'Receiver identifier is too long'),
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
