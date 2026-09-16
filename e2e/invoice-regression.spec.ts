import { expect, test, type Page } from '@playwright/test';
import fs from 'fs';

const apiBaseUrl = 'http://127.0.0.1:3013';
const stamp = Date.now();
const names = {
  business: `Regression Co ${stamp}`,
  client: `Regression Client ${stamp}`,
  currency: `Regression Rupee ${stamp}`,
  bank: `Regression Bank ${stamp}`,
  item: `Regression Item ${stamp}`
};

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).first();
const dialog = (page: Page) => page.getByRole('dialog').last();

const addEntity = async (page: Page, path: string, addLabel: string, fill: (page: Page) => Promise<void>) => {
  await page.goto(path);
  await button(page, addLabel).click();
  await fill(page);
  await dialog(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog(page)).toBeHidden();
};

/** The totals block is two aligned columns of plain divs, so a value is read by its label's index. */
const totalsValue = async (page: Page, label: string) => {
  const container = page.getByText('Subtotal', { exact: true }).locator('xpath=../..');
  const labels = container.locator('> div').first().locator('> div');
  const count = await labels.count();
  for (let index = 0; index < count; index++) {
    if ((await labels.nth(index).innerText()).startsWith(label)) {
      return container.locator('> div').nth(1).locator('> div').nth(index);
    }
  }
  throw new Error(`no totals row named ${label}`);
};

const fillDate = async (page: Page, groupName: string, month: string, day: string, year: string) => {
  const group = dialog(page).getByRole('group', { name: groupName });
  await group.getByRole('spinbutton', { name: 'Month' }).fill(month);
  await group.getByRole('spinbutton', { name: 'Day' }).fill(day);
  await group.getByRole('spinbutton', { name: 'Year' }).fill(year);
};

const expectTotal = async (page: Page, label: string, amount: string) =>
  expect
    .poll(
      async () => {
        try {
          return (await (await totalsValue(page, label)).innerText()).trim();
        } catch {
          // The totals block only appears once the invoice has a line, and it
          // re-renders on every change, so a miss here means "not yet".
          return '';
        }
      },
      { timeout: 15_000 }
    )
    .toContain(amount);

const addItemRow = async (page: Page, quantity: string, expectedSubtotal: string) => {
  await button(page, 'ADD ITEM *').click();
  await page
    .getByRole('button', { name: new RegExp(names.item) })
    .first()
    .click();
  const form = dialog(page);
  await form.getByRole('textbox', { name: 'Quantity' }).fill(quantity);
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expectTotal(page, 'Subtotal', expectedSubtotal);
};

/** An invoice cannot be saved without a layout, and a layout is only selectable from the preview. */
const selectLayout = async (page: Page) => {
  await button(page, 'Preview').click();
  await button(page, 'Customize').click();
  await dialog(page).getByRole('combobox', { name: 'Layout' }).click();
  await page.getByRole('option').first().click();
  await dialog(page).getByRole('button', { name: 'Return back' }).click();
  await button(page, 'Edit').click();
};

/**
 * `Form.tsx` pushes the edited invoice up to the page behind a 250 ms debounce,
 * and the Save button sends whatever the page last received, so a save has to
 * wait for that debounce to elapse.
 */
const settleForm = (page: Page) => page.waitForTimeout(600);

const saveInvoice = async (page: Page, method: 'POST' | 'PUT') => {
  await settleForm(page);
  const [response] = await Promise.all([
    page.waitForResponse(
      candidate => new URL(candidate.url()).pathname === '/api/invoices' && candidate.request().method() === method
    ),
    button(page, 'Save').click()
  ]);
  const body = await response.json();
  expect(body.success, JSON.stringify(body)).toBe(true);
  return body;
};

const setInvoiceNumber = async (page: Page, invoiceNumber: string) => {
  await button(page, 'INVOICE INFORMATION *').click();
  const form = dialog(page);
  await form.getByRole('textbox', { name: 'Invoice number' }).fill(invoiceNumber);
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(button(page, 'Save')).toBeEnabled();
};

test('invoice regression: create, edit, duplicate and export a PDF', async ({ page }) => {
  test.slow();

  await addEntity(page, '/businesses', 'Add business', async form => {
    await dialog(form).getByRole('textbox', { name: 'Name', exact: true }).fill(names.business);
    await dialog(form).getByRole('textbox', { name: 'Short name' }).fill('RC');
    await dialog(form).getByRole('textbox', { name: 'Address' }).fill('1 Street, City, Region 1, IN');
  });

  await addEntity(page, '/clients', 'Add client', async form => {
    await dialog(form).getByRole('textbox', { name: 'Name', exact: true }).fill(names.client);
    await dialog(form).getByRole('textbox', { name: 'Short name' }).fill('RL');
    await dialog(form).getByRole('textbox', { name: 'Address' }).fill('2 Street, City, Region 2, IN');
  });

  await addEntity(page, '/currencies', 'Add currency', async form => {
    await dialog(form).getByRole('textbox', { name: 'Symbol text' }).fill('RGN');
    await dialog(form).getByRole('textbox', { name: 'Symbol', exact: true }).fill('R');
    await dialog(form).getByRole('spinbutton', { name: 'Sub unit' }).fill('100');
    await dialog(form).getByRole('textbox', { name: 'Text', exact: true }).fill(names.currency);
    await dialog(form).getByRole('combobox', { name: 'Format' }).click();
    await form.getByRole('option', { name: 'R123', exact: true }).click();
  });

  await addEntity(page, '/banks', 'Add bank', async form => {
    await dialog(form).getByRole('textbox', { name: 'Name', exact: true }).fill(names.bank);
    await dialog(form).getByRole('textbox', { name: 'Account holder' }).fill(names.business);
    await dialog(form).getByRole('textbox', { name: 'Bank name' }).fill('Regression Bank Ltd');
    await dialog(form).getByRole('textbox', { name: 'Account number' }).fill('000123456789');
  });

  await addEntity(page, '/items', 'Add item', async form => {
    await dialog(form).getByRole('textbox', { name: 'Name', exact: true }).fill(names.item);
    await dialog(form).getByRole('textbox', { name: 'Amount' }).fill('100');
  });

  await page.goto('/invoices');
  await button(page, 'Add invoice').click();
  await button(page, 'Create new').click();

  await button(page, 'CURRENCY *').click();
  await page
    .getByRole('button', { name: new RegExp(names.currency) })
    .first()
    .click();
  await button(page, 'BANK').click();
  await page
    .getByRole('button', { name: new RegExp(names.bank) })
    .first()
    .click();
  await button(page, 'BUSINESS *').click();
  await page
    .getByRole('button', { name: new RegExp(names.business) })
    .first()
    .click();
  await button(page, 'BILL TO *').click();
  await page
    .getByRole('button', { name: new RegExp(names.client) })
    .first()
    .click();

  await addItemRow(page, '1', '100.00');
  await addItemRow(page, '2', '300.00');

  await (await totalsValue(page, 'Discount')).click();
  const discountForm = dialog(page);
  await discountForm.getByRole('combobox', { name: 'Type' }).click();
  await page.getByRole('option', { name: 'Fixed' }).click();
  await discountForm.getByRole('textbox', { name: 'Fixed', exact: true }).fill('10');
  await discountForm.getByRole('textbox', { name: 'Name', exact: true }).fill('Loyalty');
  await discountForm.getByRole('button', { name: 'Save', exact: true }).click();
  await expectTotal(page, 'Discount', '10.00');
  await expectTotal(page, 'Total', '290.00');

  await (await totalsValue(page, 'Paid')).click();
  const paymentForm = dialog(page);
  await paymentForm.getByRole('textbox', { name: 'Amount', exact: true }).fill('40');
  await fillDate(page, 'Paid at', '09', '16', '2026');
  await paymentForm.getByRole('button', { name: 'Save', exact: true }).click();
  await expectTotal(page, 'Paid', '40.00');
  await expectTotal(page, 'Balance due', '250.00');

  await selectLayout(page);
  await setInvoiceNumber(page, '1');

  const created = await saveInvoice(page, 'POST');
  expect(created.data.invoiceNumber).toBe('1');
  await expect(page.getByText('PARTIALLY').first()).toBeVisible();

  // Edit: raise the second line to 3, which moves the subtotal from 300 to 400.
  await page
    .getByRole('button', { name: new RegExp(`${names.item}.*X 2`) })
    .last()
    .click();
  const itemForm = dialog(page);
  await itemForm.getByRole('textbox', { name: 'Quantity' }).fill('3');
  await itemForm.getByRole('button', { name: 'Save', exact: true }).click();
  await expectTotal(page, 'Subtotal', '400.00');
  await saveInvoice(page, 'PUT');

  // Reopen from the list to prove the edit was persisted, not just held in the form.
  await page.reload();
  await page
    .getByRole('button', { name: new RegExp(names.client) })
    .first()
    .click();
  await expectTotal(page, 'Subtotal', '400.00');
  await expectTotal(page, 'Balance due', '350.00');

  // Preview, then download the PDF.
  await button(page, 'Preview').click();
  await expect(page.locator('iframe')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), button(page, 'Export PDF').click()]);
  const pdfPath = await download.path();
  expect(pdfPath).toBeTruthy();
  expect(fs.statSync(pdfPath as string).size).toBeGreaterThan(1000);
  await button(page, 'Edit').click();

  // Duplicate: the copy takes the next number in the series.
  await button(page, 'Actions').click();
  await dialog(page).getByText('Duplicate', { exact: true }).click();
  await page.waitForTimeout(2500);

  const response = await page.request.get(`${apiBaseUrl}/api/invoices?type=invoice`);
  const body = (await response.json()) as { data: Array<{ invoiceNumber: string; clientId: number }> };
  const numbers = body.data.map(invoice => invoice.invoiceNumber).sort();
  expect(numbers).toEqual(['1', '2']);
});
