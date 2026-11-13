// The tests use their own database, created fresh for every run. Locally that is the docker-compose PostgreSQL;
// CI sets these two URLs to its service container.
export const ADMIN_URL = process.env.TEST_ADMIN_URL ?? 'postgres://msbs:msbs-local-only@127.0.0.1:5433/msbs';
export const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://msbs:msbs-local-only@127.0.0.1:5433/msbs_test';
