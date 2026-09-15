import path from 'path';
import { runSqlMigrations } from '../shared/db/migrationRunner';
import { openPostgreSql } from '../shared/db/setup';
import { DatabaseType } from '../shared/enums/databaseType';
import type { DatabaseAdapter } from '../shared/types/DatabaseAdapter';
import type { PostgresConfig } from '../shared/types/postgresConfig';
import type { SqLiteConfig } from '../shared/types/sqliteConfig';

export let dbInstance: DatabaseAdapter | null = null;

const migrationsPath =
  process.env.MIGRATIONS_PATH || path.resolve(process.cwd(), 'src', 'backend', 'shared', 'migrations');

export const setupDB = async (opts: {
  dbType: DatabaseType;
  createIfMissing?: boolean;
  postgresConfig?: PostgresConfig;
  sqliteConfig?: SqLiteConfig;
}): Promise<void> => {
  const { dbType, postgresConfig } = opts;

  if (dbInstance) {
    await (dbInstance as DatabaseAdapter).close();
    dbInstance = null;
  }

  if (dbType !== DatabaseType.postgre || !postgresConfig) throw new Error('error.postgresConfig');

  const { db: newDb, connectionString } = await openPostgreSql(postgresConfig);
  await runSqlMigrations(connectionString, migrationsPath);
  dbInstance = newDb;
};
