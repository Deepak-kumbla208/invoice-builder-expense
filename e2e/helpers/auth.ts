import { expect, type Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import { randomBytes } from 'crypto';

export interface Credentials {
  email: string;
  password: string;
  name: string;
}

const migrationUrl = () => process.env.E2E_MIGRATION_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL;

export const canCreateSuperAdmin = () => Boolean(migrationUrl());

export const createSuperAdmin = (): Credentials => {
  const url = migrationUrl();
  if (!url) throw new Error('Set E2E_MIGRATION_DATABASE_URL (app_owner) so the spec can create a Super Admin.');
  const suffix = randomBytes(4).toString('hex');
  const credentials = {
    email: `e2e-admin-${suffix}@example.test`,
    name: `E2E Admin ${suffix}`,
    password: `E2e-admin-${randomBytes(9).toString('hex')}`
  };
  execFileSync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'src/backend/admin-cli/index.ts', 'create-super-admin'],
    {
      input: [credentials.email, credentials.name, credentials.password, credentials.password, ''].join('\n'),
      env: { ...process.env, MIGRATION_DATABASE_URL: url },
      stdio: ['pipe', 'pipe', 'pipe']
    }
  );
  return credentials;
};

export const signIn = async (page: Page, email: string, password: string) => {
  if (!new URL(page.url() === 'about:blank' ? 'http://x/' : page.url()).pathname.startsWith('/login')) {
    await page.goto('/login');
  }
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
};

export const signOut = async (page: Page) => {
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
};
