import { randomInt } from 'node:crypto';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { STARTING_BALANCE } from '../config.js';
import { accounts, users } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { issueToken } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { loginSchema, registerSchema } from '../schemas.js';

const HASH_OPTIONS = { type: argon2.argon2id };
const UNIQUE_VIOLATION = '23505';

export function authRoutes({ db, config, limits }) {
  const router = Router();
  // Compared against when the account doesn't exist, so a wrong account ID takes as long as a wrong password.
  const dummyHash = argon2.hash('not-a-real-password', HASH_OPTIONS);

  router.post('/register', limits.register, validateBody(registerSchema), async (req, res) => {
    const phoneNumber = `${req.body.countryCode}${req.body.phoneNumber}`;
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, req.body.username));
    if (existing) throw new HttpError(409, 'Username is already taken');
    const [phoneExists] = await db.select({ id: users.id }).from(users).where(eq(users.phoneNumber, phoneNumber));
    if (phoneExists) throw new HttpError(409, 'Phone number is already registered');
    const passwordHash = await argon2.hash(req.body.password, HASH_OPTIONS);
    for (let attempt = 0; attempt < 5; attempt++) {
      const accountId = String(randomInt(1_000_000_000, 10_000_000_000));
      try {
        await db.transaction(async (tx) => {
          const [user] = await tx.insert(users)
            .values({ username: req.body.username, phoneNumber, displayName: req.body.displayName, passwordHash })
            .returning({ id: users.id });
          await tx.insert(accounts).values({ ownerUserId: user.id, accountId, balance: STARTING_BALANCE });
        });
        // Only the new account ID goes back: never the password or its hash.
        return res.status(201).json({ accountId, username: req.body.username });
      } catch (err) {
        if (err.cause?.code !== UNIQUE_VIOLATION && err.code !== UNIQUE_VIOLATION) throw err;
        const constraint = err.cause?.constraint ?? err.constraint;
        if (constraint === 'users_username_unique') throw new HttpError(409, 'Username is already taken');
        if (constraint === 'users_phone_number_unique') throw new HttpError(409, 'Phone number is already registered');
        // That random account ID was taken: try another.
      }
    }
    throw new HttpError(503, 'Could not create an account, try again');
  });

  router.post('/login', limits.login, limits.failedLogin, validateBody(loginSchema), async (req, res) => {
    const [found] = await db.select({ userId: users.id, passwordHash: users.passwordHash })
      .from(accounts)
      .innerJoin(users, eq(users.id, accounts.ownerUserId))
      .where(req.body.identifier.length === 10 && /^[1-9][0-9]{9}$/.test(req.body.identifier)
        ? eq(accounts.accountId, req.body.identifier)
        : eq(users.username, req.body.identifier.toLowerCase()));
    const ok = await argon2.verify(found?.passwordHash ?? await dummyHash, req.body.password);
    // One message for "no such account" and "wrong password", so a guess can't tell which.
    if (!found || !ok) throw new HttpError(401, 'Invalid credentials');
    res.json({ token: issueToken(found.userId, config), expiresIn: config.jwtLifetimeSeconds });
  });

  return router;
}
