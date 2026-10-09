// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgTestDb, type PgTestDb } from './helpers/pgTestDb';

const RLS_DENIED = { code: '42501' };

describe('invoice scoping schema (0006)', () => {
  let testDb: PgTestDb;
  let companyA: number;
  let companyB: number;
  let officeA1: number;
  let officeB1: number;
  let clientA: number;
  let currencyId: number;

  beforeAll(async () => {
    testDb = await createPgTestDb();
    ({ companyA, companyB, officeA1, officeB1, clientA, currencyId } = await testDb.withTx(async db => {
      const insert = (sql: string, params: unknown[] = []) => db.run(sql, params, true);
      const a = await insert(`INSERT INTO businesses ("name", "shortName") VALUES ('Company A', 'CA')`);
      const b = await insert(`INSERT INTO businesses ("name", "shortName") VALUES ('Company B', 'CB')`);
      const office = (businessId: number, code: string) =>
        insert('INSERT INTO offices (business_id, name, code, state_code) VALUES (?, ?, ?, ?)', [
          businessId,
          code,
          code,
          '29'
        ]);
      return {
        companyA: a,
        companyB: b,
        officeA1: await office(a, 'A1'),
        officeB1: await office(b, 'B1'),
        clientA: await insert(`INSERT INTO clients ("name", "shortName", business_id) VALUES ('Client A', 'CA', ?)`, [
          a
        ]),
        currencyId: (await db.get<{ id: number }>(`SELECT id FROM currencies LIMIT 1`))!.id
      };
    }));
  });

  afterAll(async () => {
    await testDb.drop();
  });

  const draft = (overrides: Record<string, unknown> = {}) => ({
    invoiceType: 'invoice',
    businessId: companyA,
    clientId: clientA,
    currencyId,
    issuedAt: '2026-04-01',
    office_id: officeA1,
    document_status: 'draft',
    ...overrides
  });

  const insertInvoice = (values: Record<string, unknown>) =>
    testDb.withTx(db => {
      const keys = Object.keys(values);
      const columns = keys.map(key => `"${key}"`).join(', ');
      const placeholders = keys.map(() => '?').join(', ');
      return db.run(
        `INSERT INTO invoices (${columns}) VALUES (${placeholders})`,
        keys.map(key => values[key]),
        true
      );
    });

  describe('gst_rates', () => {
    it('seeds the notified slabs, active and editable', async () => {
      const rows = await testDb.withTx(db =>
        db.all<{ rate: string; is_active: boolean }>('SELECT rate, is_active FROM gst_rates ORDER BY rate')
      );
      expect(rows.map(row => Number(row.rate))).toEqual([0, 0.25, 1.5, 3, 5, 18, 40]);
      expect(rows.every(row => row.is_active)).toBe(true);
    });

    it('rejects a duplicate or out-of-range rate', async () => {
      await expect(
        testDb.withTx(db => db.run(`INSERT INTO gst_rates (rate, label) VALUES (18, 'dup')`))
      ).rejects.toThrow();
      await expect(
        testDb.withTx(db => db.run(`INSERT INTO gst_rates (rate, label) VALUES (101, 'nope')`))
      ).rejects.toThrow();
    });
  });

  describe('company scoping', () => {
    it('ties an invoice to an office and a customer of its own company', async () => {
      await expect(insertInvoice(draft({ invoiceNumber: '1', document_status: 'issued' }))).resolves.toBeGreaterThan(0);
    });

    it('refuses an office belonging to another company', async () => {
      await expect(insertInvoice(draft({ office_id: officeB1 }))).rejects.toThrow(/invoices_office_business_fkey/);
    });

    // The (clientId, businessId) composite FK lands in the contract step with the NOT NULL on
    // clients.business_id: both referencing columns are already NOT NULL, so adding it now would
    // be enforced against customers that nothing populates a company for until 2.4.
    it.todo('refuses a customer belonging to another company (C3, with the contract step)');

    it('defaults a customer to India and keeps GSTIN and state code well formed', async () => {
      const row = await testDb.withTx(db =>
        db.get<{ countryCode: string; is_sez: boolean }>(`SELECT "countryCode", is_sez FROM clients WHERE id = ?`, [
          clientA
        ])
      );
      expect(row).toEqual({ countryCode: 'IN', is_sez: false });

      await expect(
        testDb.withTx(db => db.run(`UPDATE clients SET gstin = 'nonsense' WHERE id = ?`, [clientA]))
      ).rejects.toThrow(/clients_gstin_format/);
      await expect(
        testDb.withTx(db => db.run(`UPDATE clients SET state_code = '999' WHERE id = ?`, [clientA]))
      ).rejects.toThrow(/clients_state_code_format/);
    });
  });

  describe('document lifecycle', () => {
    it('lets a draft go unnumbered but requires a number once issued', async () => {
      await expect(insertInvoice(draft({ invoiceNumber: null }))).resolves.toBeGreaterThan(0);
      await expect(insertInvoice(draft({ document_status: 'issued', invoiceNumber: null }))).rejects.toThrow(
        /invoices_issued_has_number/
      );
    });

    it('keeps the number unique per office, type and number, ignoring drafts', async () => {
      await insertInvoice(draft({ document_status: 'issued', invoiceNumber: 'A1/26-27/0001' }));
      await expect(insertInvoice(draft({ document_status: 'issued', invoiceNumber: 'A1/26-27/0001' }))).rejects.toThrow(
        /invoices_office_type_number_key/
      );
      // Two unnumbered drafts never collide.
      await expect(insertInvoice(draft({ invoiceNumber: null }))).resolves.toBeGreaterThan(0);
      await expect(insertInvoice(draft({ invoiceNumber: null }))).resolves.toBeGreaterThan(0);
    });

    it('accepts credit_note as a type, and ties it to exactly one original invoice', async () => {
      const original = await insertInvoice(draft({ document_status: 'issued', invoiceNumber: 'A1/26-27/0100' }));
      await expect(
        insertInvoice(draft({ invoiceType: 'credit_note', original_invoice_id: original }))
      ).resolves.toBeGreaterThan(0);
      // A credit note must reference one, and nothing else may.
      await expect(insertInvoice(draft({ invoiceType: 'credit_note' }))).rejects.toThrow(
        /invoices_credit_note_has_original/
      );
      await expect(insertInvoice(draft({ original_invoice_id: original }))).rejects.toThrow(
        /invoices_credit_note_has_original/
      );
    });

    it('refuses a credit note against an invoice in another office', async () => {
      const otherOffice = await testDb.withTx(db =>
        db.run(
          'INSERT INTO offices (business_id, name, code, state_code) VALUES (?, ?, ?, ?)',
          [companyA, 'A2', 'A2', '29'],
          true
        )
      );
      const original = await insertInvoice(draft({ document_status: 'issued', invoiceNumber: 'A1/26-27/0200' }));
      await expect(
        insertInvoice(draft({ invoiceType: 'credit_note', original_invoice_id: original, office_id: otherOffice }))
      ).rejects.toThrow(/invoices_original_office_fkey/);
    });

    it('only allows cancellation details on a cancelled invoice', async () => {
      await expect(insertInvoice(draft({ cancel_reason: 'oops' }))).rejects.toThrow(/invoices_cancelled_has_reason/);
      await expect(
        insertInvoice(
          draft({
            document_status: 'cancelled',
            invoiceNumber: 'A1/26-27/0300',
            cancel_reason: 'duplicate',
            cancelled_at: '2026-04-02T00:00:00Z'
          })
        )
      ).resolves.toBeGreaterThan(0);
    });

    it('stores the document date as a calendar date, not a moment', async () => {
      const column = await testDb.withTx(db =>
        db.get<{ data_type: string }>(
          `SELECT data_type FROM information_schema.columns
           WHERE table_name = 'invoices' AND column_name = 'issuedAt'`
        )
      );
      expect(column).toEqual({ data_type: 'date' });
    });

    it('constrains the supply type to the six the tax module knows', async () => {
      await expect(insertInvoice(draft({ supply_type: 'intra_state' }))).resolves.toBeGreaterThan(0);
      await expect(insertInvoice(draft({ supply_type: 'reverse_charge' }))).rejects.toThrow(
        /invoices_supply_type_check/
      );
    });

    it('requires a positive exchange rate and a two-digit place of supply', async () => {
      await expect(insertInvoice(draft({ exchange_rate_to_inr: 0 }))).rejects.toThrow(
        /invoices_exchange_rate_positive/
      );
      await expect(insertInvoice(draft({ place_of_supply_state_code: '6' }))).rejects.toThrow(/invoices_pos_format/);
      await expect(insertInvoice(draft({ place_of_supply_state_code: '96' }))).resolves.toBeGreaterThan(0);
    });
  });

  describe('numbering series', () => {
    // The legacy (businessId, clientId, invoiceType) key is still in place during the expand
    // step, so each row gets its own customer: that isolates the new key as the thing under test.
    const seriesRow = async (officeId: number, type: string, fy: string) => {
      const client = await testDb.withTx(db =>
        db.run(
          `INSERT INTO clients ("name", "shortName", business_id) VALUES (?, 'CX', ?)`,
          [`Series client ${Math.random()}`, companyA],
          true
        )
      );
      return testDb.withTx(db =>
        db.run(
          `INSERT INTO invoice_sequences ("businessId", "clientId", "nextSequence", office_id, invoice_type, financial_year, next_sequence)
             VALUES (?, ?, 1, ?, ?, ?, 1)`,
          [companyA, client, officeId, type, fy],
          true
        )
      );
    };

    it('is unique per office, type and financial year', async () => {
      await expect(seriesRow(officeA1, 'invoice', '26-27')).resolves.toBeGreaterThan(0);
      await expect(seriesRow(officeA1, 'invoice', '26-27')).rejects.toThrow(/invoice_sequences_office_type_fy_key/);
      // A different year, type or office is its own series.
      await expect(seriesRow(officeA1, 'invoice', '27-28')).resolves.toBeGreaterThan(0);
      await expect(seriesRow(officeA1, 'credit_note', '26-27')).resolves.toBeGreaterThan(0);
      await expect(seriesRow(officeB1, 'invoice', '26-27')).resolves.toBeGreaterThan(0);
    });

    it('checks the financial year format', async () => {
      await expect(
        testDb.withTx(db =>
          db.run(
            `INSERT INTO invoice_sequences ("businessId", "clientId", "nextSequence", office_id, invoice_type, financial_year, next_sequence)
             VALUES (?, ?, 1, ?, 'invoice', '2026-2027', 1)`,
            [companyA, clientA, officeA1]
          )
        )
      ).rejects.toThrow(/invoice_sequences_financial_year_format/);
    });
  });

  describe('row level security on the new tables', () => {
    it('enables and forces RLS with one policy per command', async () => {
      const rows = await testDb.withTx(db =>
        db.all<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean; policies: string }>(
          `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, count(p.polname)::text AS policies
           FROM pg_class c LEFT JOIN pg_policy p ON p.polrelid = c.oid
           WHERE c.relname = ANY(?) GROUP BY 1, 2, 3 ORDER BY 1`,
          [['office_bank_accounts', 'invoice_office_snapshots']]
        )
      );
      expect(rows).toEqual([
        { relname: 'invoice_office_snapshots', relrowsecurity: true, relforcerowsecurity: true, policies: '4' },
        { relname: 'office_bank_accounts', relrowsecurity: true, relforcerowsecurity: true, policies: '4' }
      ]);
    });

    it('leaves gst_rates global, like the other reference tables', async () => {
      const row = await testDb.withTx(db =>
        db.get<{ relrowsecurity: boolean }>(`SELECT relrowsecurity FROM pg_class WHERE relname = 'gst_rates'`)
      );
      expect(row).toEqual({ relrowsecurity: false });
    });

    it('scopes an office bank account to the caller’s offices', async () => {
      const bankId = await testDb.withTx(db =>
        db.run(`INSERT INTO banks ("name", type, business_id) VALUES ('Bank A', 'bank', ?)`, [companyA], true)
      );
      const asOfficeA1 = testDb.rolePool('app_user');
      const run = async (sql: string, params: unknown[], officeIds: string, businessIds: string) => {
        const client = await asOfficeA1.connect();
        try {
          await client.query('BEGIN');
          await client.query(`SELECT set_config('app.user_id', '1', true)`);
          await client.query(`SELECT set_config('app.office_ids', $1, true)`, [officeIds]);
          await client.query(`SELECT set_config('app.business_ids', $1, true)`, [businessIds]);
          const result = await client.query(sql, params);
          await client.query('COMMIT');
          return result.rowCount;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      };

      await expect(
        run(
          'INSERT INTO office_bank_accounts (office_id, bank_id) VALUES ($1, $2)',
          [officeA1, bankId],
          String(officeA1),
          String(companyA)
        )
      ).resolves.toBe(1);
      // The same row, attempted from a session that cannot see that office.
      await expect(
        run(
          'INSERT INTO office_bank_accounts (office_id, bank_id) VALUES ($1, $2)',
          [officeA1, bankId],
          String(officeB1),
          String(companyB)
        )
      ).rejects.toMatchObject(RLS_DENIED);
      await expect(
        run('SELECT 1 FROM office_bank_accounts WHERE office_id = $1', [officeA1], String(officeB1), String(companyB))
      ).resolves.toBe(0);
    });
  });
});
