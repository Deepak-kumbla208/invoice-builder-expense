import { randomBytes } from 'crypto';
import path from 'path';
import { Client } from 'pg';
import { createPostgresAdapter } from '../../shared/db/client';
import { runSqlMigrations } from '../../shared/db/migrationRunner';
import type { DatabaseAdapter } from '../../shared/types/DatabaseAdapter';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/postgres';
const MIGRATIONS_PATH = path.resolve(__dirname, '../../shared/migrations');

const withAdminClient = async <T>(fn: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
};

export type PgTestDb = { db: DatabaseAdapter; databaseName: string; drop: () => Promise<void> };

export const createPgTestDb = async (): Promise<PgTestDb> => {
  const databaseName = `t_${randomBytes(6).toString('hex')}`;
  await withAdminClient(client => client.query(`CREATE DATABASE "${databaseName}"`));

  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${databaseName}`;
  await runSqlMigrations(url.toString(), MIGRATIONS_PATH);
  const db = createPostgresAdapter(url.toString());

  const drop = async () => {
    await db.close();
    await withAdminClient(client => client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`));
  };

  return { db, databaseName, drop };
};
