import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'crypto';
import { canCreateSuperAdmin, createSuperAdmin, signIn, signOut } from './helpers/auth';

const suffix = randomBytes(3).toString('hex');
const names = {
  company: `Shell Co ${suffix}`,
  office: `Shell Office ${suffix}`,
  officeCode: suffix
    .slice(0, 3)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, 'X'),
  user: `Shell User ${suffix}`,
  email: `shell-user-${suffix}@example.test`
};

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).first();
const dialog = (page: Page) => page.getByRole('dialog').last();
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main menu' });

const choose = async (page: Page, combobox: string, option: string, scope = page) => {
  await scope.getByRole('combobox', { name: combobox }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
};

test('a Super Admin sets up a company, office and user, who then signs in with only their own access', async ({
  page
}) => {
  test.skip(!canCreateSuperAdmin(), 'needs E2E_MIGRATION_DATABASE_URL to create a Super Admin');
  test.slow();
  const admin = createSuperAdmin();

  await page.goto('/users');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fusers$/);
  await expect(page.getByText('Forgot password? Contact your office admin.')).toBeVisible();

  await signIn(page, admin.email, 'not the password');
  await expect(page.getByRole('alert')).toHaveText('The email or password is incorrect.');

  await signIn(page, admin.email, admin.password);
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByText('Select a user to view details.')).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: `Welcome, ${admin.name}` })).toBeVisible();
  await nav(page).getByRole('button', { name: 'Administration' }).click();
  for (const item of [
    'Users',
    'Roles & permissions',
    'Companies',
    'Offices',
    'Invoice setup',
    'Audit log',
    'Settings'
  ]) {
    await expect(nav(page).getByRole('button', { name: item, exact: true })).toBeVisible();
  }

  await nav(page).getByRole('button', { name: 'Companies', exact: true }).click();
  await button(page, 'Add company').click();
  await dialog(page).getByRole('textbox', { name: 'Name', exact: true }).fill(names.company);
  await dialog(page).getByRole('textbox', { name: 'Short name' }).fill('SC');
  await dialog(page).getByRole('textbox', { name: 'PAN', exact: true }).fill('AAAAA1234A');
  await dialog(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByText(names.company).first()).toBeVisible();

  await nav(page).getByRole('button', { name: 'Offices', exact: true }).click();
  await button(page, 'Add office').click();
  await choose(page, 'Company', names.company, dialog(page));
  await dialog(page).getByRole('textbox', { name: 'Name', exact: true }).fill(names.office);
  await dialog(page).getByRole('textbox', { name: 'Code', exact: true }).fill(names.officeCode);
  await choose(page, 'State', '07 · Delhi', dialog(page));
  await dialog(page).getByRole('textbox', { name: 'GSTIN', exact: true }).fill('29AAAAA1234A1Z5');
  await expect(
    dialog(page).getByText('Enter a valid 15-character GSTIN that starts with the state code.')
  ).toBeVisible();
  await dialog(page).getByRole('textbox', { name: 'GSTIN', exact: true }).fill('07AAAAA1234A1Z5');
  await dialog(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByText(names.office).first()).toBeVisible();

  await nav(page).getByRole('button', { name: 'Users', exact: true }).click();
  await button(page, 'Add user').click();
  await page.getByRole('textbox', { name: 'Full name' }).fill(names.user);
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(names.email);
  await choose(page, 'Role', 'User');
  await page.getByRole('combobox', { name: 'Offices' }).fill(names.office);
  await page.getByRole('option', { name: `${names.office} (${names.officeCode})` }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('checkbox', { name: /^Create expenses and reimbursement requests/ })).toBeDisabled();
  await button(page, 'Save').click();

  const passwordDialog = page.getByRole('dialog', { name: 'Temporary password' });
  await expect(passwordDialog).toBeVisible();
  const temporaryPassword = (await passwordDialog.locator('code').innerText()).trim();
  expect(temporaryPassword).toHaveLength(16);
  await passwordDialog.getByRole('button', { name: 'Done' }).click();

  await signOut(page);

  await signIn(page, names.email, temporaryPassword);
  await expect(page).toHaveURL(/\/change-password/);
  await expect(
    page.getByText('Your password was set by an administrator. Choose a new one to continue.')
  ).toBeVisible();
  const newPassword = `Shell-user-${randomBytes(6).toString('hex')}`;
  await page.getByLabel('Current password').fill(temporaryPassword);
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm new password').fill(newPassword);
  await page.getByRole('button', { name: 'Change password' }).click();

  await expect(page.getByRole('heading', { name: `Welcome, ${names.user}` })).toBeVisible();
  await expect(page.getByText('Set up your organisation')).toBeHidden();
  await expect(nav(page).getByRole('button')).toHaveText(['Dashboard']);

  await page.goto('/users');
  await expect(page.getByText("You don't have access to this page.")).toBeVisible();
  await button(page, 'Back to dashboard').click();
  await expect(page).toHaveURL(/\/$/);

  await signOut(page);
  await signIn(page, names.email, newPassword);
  await expect(page.getByRole('heading', { name: `Welcome, ${names.user}` })).toBeVisible();
});
