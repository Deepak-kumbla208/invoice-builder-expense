import { expect, test } from '@playwright/test';

const apiBaseUrl = 'http://127.0.0.1:3013';

test('the layouts page renders a seeded V2 layout', async ({ page, request }) => {
  const layoutName = `E2E V2 Sidebar ${Date.now()}`;
  const layoutResponse = await request.post(`${apiBaseUrl}/api/layouts`, {
    data: {
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
    }
  });
  expect(layoutResponse.ok()).toBe(true);

  await page.goto('/layouts');
  await expect(page.locator('body')).toContainText(layoutName);
  await expect(page.locator('body')).not.toContainText('Application error');
});
