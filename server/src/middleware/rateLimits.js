import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

const MINUTE = 60 * 1000;

function limiter(windowMs, limit, extra = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many requests, try again later' },
    ...extra,
  });
}

export function rateLimits(limits) {
  return {
    register: limiter(60 * MINUTE, limits.registerPerHour),
    // All login attempts from one address, and a much stricter count of failed ones per address and account, so
    // password guessing stops after a few tries while a user who types it right is not slowed down.
    login: limiter(15 * MINUTE, limits.loginPer15Min),
    failedLogin: limiter(15 * MINUTE, limits.failedLoginsPer15Min, {
      skipSuccessfulRequests: true,
      keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.accountId ?? '').slice(0, 10)}`,
    }),
    // Per logged-in user (runs after requireAuth).
    transfer: limiter(MINUTE, limits.transfersPerMinute, { keyGenerator: (req) => req.userId }),
  };
}
