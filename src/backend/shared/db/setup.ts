import { Client } from 'pg';
import type { DatabaseAdapter } from '../types/DatabaseAdapter';
import type { PostgresConfig } from '../types/postgresConfig';
import { createPostgresAdapter } from './client';

const sanitizeDatabaseName = (database: string): string => {
  if (typeof database !== 'string' || database.trim().length === 0) {
    throw new Error('error.invalidDBName');
  }
  const trimmed = database.trim();
  const maxLength = 63;
  if (trimmed.length > maxLength) {
    throw new Error('error.databaseNameTooLong');
  }
  if (!/^[A-Za-z0-9_]+$/.test(trimmed)) {
    throw new Error('error.databaseNameInvalid');
  }
  return trimmed;
};

export const testPostgresConnection = async (data?: PostgresConfig): Promise<void> => {
  if (!data) throw new Error('error.connectionFailed');

  const { host, port, user, password, ssl } = data;

  const client = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
    ssl
  });

  try {
    await client.connect();
    await client.query('SELECT 1');
  } catch {
    throw new Error('error.connectionFailed');
  } finally {
    await client.end().catch(() => {});
  }
};

export const openPostgreSql = async (
  data: PostgresConfig
): Promise<{ db: DatabaseAdapter; connectionString: string }> => {
  const { host, port, user, password, database, ssl } = data;
  const safeDatabase = sanitizeDatabaseName(database);

  const authPart = password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}` : encodeURIComponent(user);
  const sslPart = ssl ? '?sslmode=require' : '';
  const connectionString = `postgresql://${authPart}@${host}:${port}/${safeDatabase}${sslPart}`;

  try {
    const tempClient = new Client({
      host,
      port,
      user,
      password,
      database: 'postgres',
      ssl
    });
    await tempClient.connect();
    const res = await tempClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [safeDatabase]);
    if (res.rowCount === 0) {
      await tempClient.query(`CREATE DATABASE "${safeDatabase}"`);
    }
    await tempClient.end();
  } catch {
    throw new Error('error.databaseCreationFailed');
  }

  const adapter = await createPostgresAdapter(connectionString);

  return { db: adapter, connectionString };
};
