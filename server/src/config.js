// Money is stored as whole paise (1 rupee = 100 paise) in BIGINT columns and sent over JSON as decimal strings, so
// neither the database nor JavaScript ever rounds an amount.
export const MAX_TRANSFER = 10_000_000n; // ₹1,00,000.00 per transfer
export const MAX_BALANCE = 100_000_000_000n; // ₹1,00,00,00,000.00 per account
export const STARTING_BALANCE = 1_000_000n; // ₹10,000.00 of virtual money for every new account
export const HISTORY_MAX_PAGE = 50;

export function loadConfig(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be set to a random string of at least 32 characters');
  }
  return {
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    jwtLifetimeSeconds: Number(env.JWT_LIFETIME_SECONDS ?? 15 * 60),
    port: Number(env.PORT ?? 3000),
    // Only set this behind a reverse proxy you control, or clients could pick their own rate-limit key.
    trustProxy: env.TRUST_PROXY === 'true' ? 1 : false,
    limits: {
      registerPerHour: 10,
      loginPer15Min: 20,
      failedLoginsPer15Min: 5,
      transfersPerMinute: 10,
    },
  };
}
