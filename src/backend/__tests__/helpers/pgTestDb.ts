import { randomBytes } from 'crypto';
import path from 'path';
import { Client, Pool } from 'pg';
import { createWithTx, type Db } from '../../shared/db/tx';
import { runSqlMigrations } from '../../shared/db/migrationRunner';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/postgres';
const MIGRATIONS_PATH = path.resolve(__dirname, '../../shared/migrations');
const APP_ROLES = ['app_owner', 'app_user'];

const withClient = async <T>(connectionString: string, fn: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
};

const assertAppRoles = async (client: Client) => {
  const { rows } = await client.query<{ rolname: string }>('SELECT rolname FROM pg_roles WHERE rolname = ANY($1)', [
    APP_ROLES
  ]);
  const missing = APP_ROLES.filter(role => !rows.some(row => row.rolname === role));
  if (missing.length > 0) {
    throw new Error(
      `Test database is missing role(s) ${missing.join(', ')}: run db/init/00-roles.sql against it ` +
        '(recreate postgres-test with `docker compose -f docker-compose.dev.yml up -d --force-recreate postgres-test`)'
    );
  }
};

const withRole = (connectionString: string, role: string) => {
  const url = new URL(connectionString);
  url.searchParams.set('options', `-c role=${role}`);
  return url.toString();
};

export type PgTestDb = {
  withTx: <T>(fn: (db: Db) => Promise<T>) => Promise<T>;
  rolePool: (role: 'app_user' | 'app_owner', max?: number) => Pool;
  migrate: () => Promise<string[]>;
  databaseName: string;
  drop: () => Promise<void>;
};

export const createPgTestDb = async (): Promise<PgTestDb> => {
  const databaseName = `t_${randomBytes(6).toString('hex')}`;
  await withClient(TEST_DATABASE_URL, async client => {
    await assertAppRoles(client);
    await client.query(`CREATE DATABASE "${databaseName}"`);
    await client.query(`GRANT CONNECT, CREATE ON DATABASE "${databaseName}" TO app_owner`);
  });

  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${databaseName}`;
  const connectionString = url.toString();
  await withClient(connectionString, client => client.query('GRANT CREATE ON SCHEMA public TO app_owner'));

  const migrate = () => runSqlMigrations(withRole(connectionString, 'app_owner'), MIGRATIONS_PATH);
  await migrate();

  const pool = new Pool({ connectionString });
  const withTx = createWithTx(pool);
  const rolePools: Pool[] = [];
  const rolePool = (role: 'app_user' | 'app_owner', max = 10) => {
    const created = new Pool({ connectionString: withRole(connectionString, role), max });
    rolePools.push(created);
    return created;
  };

  const drop = async () => {
    await Promise.all(rolePools.map(created => created.end()));
    await pool.end();
    await withClient(TEST_DATABASE_URL, client =>
      client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
    );
  };

  return { withTx, rolePool, migrate, databaseName, drop };
};
