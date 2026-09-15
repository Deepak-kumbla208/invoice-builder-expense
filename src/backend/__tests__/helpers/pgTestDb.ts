import { randomBytes } from 'crypto';
import path from 'path';
import { Client, Pool } from 'pg';
import { createWithTx, type Db } from '../../shared/db/tx';
import { runSqlMigrations } from '../../shared/db/migrationRunner';

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

export type PgTestDb = {
  withTx: <T>(fn: (db: Db) => Promise<T>) => Promise<T>;
  databaseName: string;
  drop: () => Promise<void>;
};

export const createPgTestDb = async (): Promise<PgTestDb> => {
  const databaseName = `t_${randomBytes(6).toString('hex')}`;
  await withAdminClient(client => client.query(`CREATE DATABASE "${databaseName}"`));

  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${databaseName}`;
  const connectionString = url.toString();
  await runSqlMigrations(connectionString, MIGRATIONS_PATH);

  const pool = new Pool({ connectionString });
  const withTx = createWithTx(pool);

  const drop = async () => {
    await pool.end();
    await withAdminClient(client => client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`));
  };

  return { withTx, databaseName, drop };
};
