import { expect, test } from '@playwright/test';
import { canCreateSuperAdmin, createSuperAdmin, signIn } from './helpers/auth';

test('the layouts page renders a seeded V2 layout', async ({ page }) => {
  test.skip(!canCreateSuperAdmin(), 'needs E2E_MIGRATION_DATABASE_URL to create a Super Admin');
  test.setTimeout(60_000);
  const admin = createSuperAdmin();
  await signIn(page, admin.email, admin.password);
  await expect(page.getByRole('heading', { name: `Welcome, ${admin.name}` })).toBeVisible();

  const layoutName = `E2E V2 Sidebar ${Date.now()}`;
  const layout = {
    isArchived: false,
    schema: {
      schemaVersion: 2,
      meta: { name: layoutName },
      regions: [
        {
          id: 'sidebar',
          width: '30%',
          direction: 'column',
          children: [{ type: 'block', block: { type: 'businessInfo' } }]
        },
        {
          id: 'main',
          width: '70%',
          direction: 'column',
          children: [{ type: 'section', section: { type: 'itemsTable', visible: true } }]
        }
      ]
    }
  };
  const created = await page.evaluate(async body => {
    const me = await (await fetch('/api/auth/me')).json();
    const response = await fetch('/api/layouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.data.csrfToken },
      body: JSON.stringify(body)
    });
    return response.ok;
  }, layout);
  expect(created).toBe(true);

  await page.goto('/layouts');
  await expect(page.locator('body')).toContainText(layoutName);
  await expect(page.locator('body')).not.toContainText('Application error');
});
