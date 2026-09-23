// @vitest-environment node
import { createPgTestDb, type PgTestDb } from '../../../__tests__/helpers/pgTestDb';
import { DiscountType } from '../../enums/discountType';
import { InvoiceStatus } from '../../enums/invoiceStatus';
import { InvoiceType } from '../../enums/invoiceType';
import { Language } from '../../enums/language';
import type {
  Invoice,
  InvoiceBusinessSnapshots,
  InvoiceClientSnapshots,
  InvoiceCurrencySnapshots
} from '../../types/invoice';
import { addInvoice, duplicateInvoice, getNextSequence, updateInvoice } from '../invoices';

const insertBusiness = async (testDb: PgTestDb, name: string, shortName: string) => {
  return testDb.withTx(db =>
    db.run(`INSERT INTO businesses ("name", "shortName") VALUES (?, ?)`, [name, shortName], true)
  );
};

const insertClient = async (testDb: PgTestDb, name: string, shortName: string) => {
  return testDb.withTx(db =>
    db.run(`INSERT INTO clients ("name", "shortName") VALUES (?, ?)`, [name, shortName], true)
  );
};

const getCurrencyId = async (testDb: PgTestDb, code: string) => {
  const row = await testDb.withTx(db => db.get<{ id: number }>(`SELECT id FROM currencies WHERE code = ?;`, [code]));
  return row?.id ?? -1;
};

type NewInvoicePayload = Omit<
  Invoice,
  'invoiceBusinessSnapshot' | 'invoiceClientSnapshot' | 'invoiceCurrencySnapshot'
> & {
  invoiceBusinessSnapshot: Omit<InvoiceBusinessSnapshots, 'parentInvoiceId'> & { parentInvoiceId: number };
  invoiceClientSnapshot: Omit<InvoiceClientSnapshots, 'parentInvoiceId'> & { parentInvoiceId: number };
  invoiceCurrencySnapshot: Omit<InvoiceCurrencySnapshots, 'parentInvoiceId'> & { parentInvoiceId: number };
};

const createInvoicePayload = (
  businessId: number,
  clientId: number,
  currencyId: number,
  invoiceNumber: string,
  invoiceType: InvoiceType = InvoiceType.invoice
): NewInvoicePayload => {
  const now = new Date().toISOString();
  return {
    invoiceType,
    businessId,
    clientId,
    currencyId,
    createdAt: now,
    updatedAt: now,
    issuedAt: now,
    invoiceNumber,
    isArchived: false,
    status: InvoiceStatus.unpaid,
    customerNotes: undefined,
    thanksNotes: undefined,
    termsConditionNotes: undefined,
    discountName: undefined,
    invoicePrefix: undefined,
    invoiceSuffix: undefined,
    discountType: undefined,
    discountAmountCents: '0',
    discountPercent: 0,
    shippingFeeCents: '0',
    surchargeName: undefined,
    surchargeAmountCents: '0',
    surchargeType: undefined,
    surchargePercent: 0,
    taxName: undefined,
    taxRate: 0,
    taxType: undefined,
    invoicePayments: [],
    invoiceItems: [],
    invoiceAttachments: [],
    currencyFormat: 'USD',
    language: Language.en,
    invoiceBusinessSnapshot: {
      parentInvoiceId: 0,
      businessName: `Biz ${businessId}`,
      businessShortName: `B${businessId}`,
      businessAddress: undefined,
      businessRole: undefined,
      businessEmail: undefined,
      businessPhone: undefined,
      businessAdditional: undefined,
      businessPaymentInformation: undefined,
      businessLogo: undefined,
      businessFileSize: undefined,
      businessFileType: undefined,
      businessFileName: undefined
    },
    invoiceClientSnapshot: {
      parentInvoiceId: 0,
      clientName: `Client ${clientId}`,
      clientAddress: undefined,
      clientEmail: undefined,
      clientPhone: undefined,
      clientCode: undefined,
      clientAdditional: undefined
    },
    invoiceCurrencySnapshot: {
      parentInvoiceId: 0,
      currencyCode: 'USD',
      currencySymbol: '$',
      currencySubunit: 100
    }
  };
};

const loadNextSequence = async (
  testDb: PgTestDb,
  businessId: number,
  clientId: number,
  invoiceType: InvoiceType = InvoiceType.invoice
) => {
  const row = await testDb.withTx(db =>
    db.get<{ nextSequence: number }>(
      `SELECT "nextSequence" FROM invoice_sequences WHERE "businessId" = ? AND "clientId" = ? AND "invoiceType" = ?;`,
      [businessId, clientId, invoiceType]
    )
  );
  return row ? Number(row.nextSequence) : undefined;
};

describe('invoice sequence handling', () => {
  let testDb: PgTestDb;

  beforeAll(async () => {
    testDb = await createPgTestDb();
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it('creates a client-scoped sequence row on addInvoice when missing and advances sequentially', async () => {
    const businessId = await insertBusiness(testDb, 'Business A', 'BA');
    const clientId = await insertClient(testDb, 'Client A', 'CA');
    const currencyId = await getCurrencyId(testDb, 'USD');

    await testDb.withTx(db => addInvoice(db, createInvoicePayload(businessId, clientId, currencyId, '1')));

    const result = await testDb.withTx(db =>
      addInvoice(db, createInvoicePayload(businessId, clientId, currencyId, '2'))
    );
    expect(result.success).toBe(true);

    const sequenceAfterSecondInvoice = await loadNextSequence(testDb, businessId, clientId);
    expect(sequenceAfterSecondInvoice).toBe(3);
    expect(
      (await testDb.withTx(db => getNextSequence(db, { businessId, clientId, invoiceType: InvoiceType.invoice }))).data
    ).toEqual({
      nextSequence: 3,
      formattedSequence: '3'
    });
  });

  it('duplicates an invoice to the next client-scoped sequence when sequence row is missing', async () => {
    const businessId = await insertBusiness(testDb, 'Business B', 'BB');
    const clientId = await insertClient(testDb, 'Client B', 'CB');
    const currencyId = await getCurrencyId(testDb, 'USD');

    const originalResult = await testDb.withTx(db =>
      addInvoice(db, createInvoicePayload(businessId, clientId, currencyId, '3'))
    );
    expect(originalResult.success).toBe(true);
    expect(originalResult.data).toBeDefined();

    const originalInvoice = originalResult.data as Invoice;
    expect(originalInvoice.id).toBeDefined();

    const result = await testDb.withTx(db => duplicateInvoice(db, originalInvoice.id as number, InvoiceType.invoice));

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    const duplicatedInvoice = result.data as Invoice;
    expect(duplicatedInvoice.invoiceNumber).toBe('4');

    const sequence = await loadNextSequence(testDb, businessId, clientId);
    expect(sequence).toBe(5);
    expect(
      (await testDb.withTx(db => getNextSequence(db, { businessId, clientId, invoiceType: InvoiceType.invoice }))).data
    ).toEqual({
      nextSequence: 5,
      formattedSequence: '5'
    });
  });

  it('preserves leading-zero width when suggesting the next sequence', async () => {
    const businessId = await insertBusiness(testDb, 'Business C', 'BC');
    const clientId = await insertClient(testDb, 'Client C', 'CC');
    const currencyId = await getCurrencyId(testDb, 'USD');

    const result = await testDb.withTx(db =>
      addInvoice(db, createInvoicePayload(businessId, clientId, currencyId, '000009'))
    );
    expect(result.success).toBe(true);

    expect(
      (await testDb.withTx(db => getNextSequence(db, { businessId, clientId, invoiceType: InvoiceType.invoice }))).data
    ).toEqual({
      nextSequence: 10,
      formattedSequence: '000010'
    });
  });

  it('handles carry for padded values (000999 -> 001000)', async () => {
    const businessId = await insertBusiness(testDb, 'Business F', 'BF');
    const clientId = await insertClient(testDb, 'Client F', 'CF');
    const currencyId = await getCurrencyId(testDb, 'USD');

    const result = await testDb.withTx(db =>
      addInvoice(db, createInvoicePayload(businessId, clientId, currencyId, '000999'))
    );
    expect(result.success).toBe(true);

    expect(
      (await testDb.withTx(db => getNextSequence(db, { businessId, clientId, invoiceType: InvoiceType.invoice }))).data
    ).toEqual({
      nextSequence: 1000,
      formattedSequence: '001000'
    });
  });

  it('expands width when incremented sequence exceeds current padding length', async () => {
    const businessId = await insertBusiness(testDb, 'Business D', 'BD');
    const clientId = await insertClient(testDb, 'Client D', 'CD');
    const currencyId = await getCurrencyId(testDb, 'USD');

    const result = await testDb.withTx(db =>
      addInvoice(db, createInvoicePayload(businessId, clientId, currencyId, '999999'))
    );
    expect(result.success).toBe(true);

    expect(
      (await testDb.withTx(db => getNextSequence(db, { businessId, clientId, invoiceType: InvoiceType.invoice }))).data
    ).toEqual({
      nextSequence: 1000000,
      formattedSequence: '1000000'
    });
  });

  it('duplicates invoices using padded sequence formatting', async () => {
    const businessId = await insertBusiness(testDb, 'Business E', 'BE');
    const clientId = await insertClient(testDb, 'Client E', 'CE');
    const currencyId = await getCurrencyId(testDb, 'USD');

    const originalResult = await testDb.withTx(db =>
      addInvoice(db, createInvoicePayload(businessId, clientId, currencyId, '000005'))
    );
    expect(originalResult.success).toBe(true);

    const originalInvoice = originalResult.data as Invoice;
    const duplicateResult = await testDb.withTx(db =>
      duplicateInvoice(db, originalInvoice.id as number, InvoiceType.invoice)
    );

    expect(duplicateResult.success).toBe(true);
    expect((duplicateResult.data as Invoice).invoiceNumber).toBe('000006');

    expect(
      (await testDb.withTx(db => getNextSequence(db, { businessId, clientId, invoiceType: InvoiceType.invoice }))).data
    ).toEqual({
      nextSequence: 7,
      formattedSequence: '000007'
    });
  });

  it('preserves the quotation number and sequence when converting to an invoice', async () => {
    const businessId = await insertBusiness(testDb, 'Business Conversion', 'BC');
    const clientId = await insertClient(testDb, 'Client Conversion', 'CC');
    const currencyId = await getCurrencyId(testDb, 'USD');

    const quotationResult = await testDb.withTx(db =>
      addInvoice(db, createInvoicePayload(businessId, clientId, currencyId, '000005', InvoiceType.quotation))
    );
    expect(quotationResult.success).toBe(true);

    const quotation = quotationResult.data as Invoice;
    const conversionSequenceBefore = await testDb.withTx(db =>
      getNextSequence(db, {
        businessId,
        clientId,
        invoiceType: InvoiceType.invoice
      })
    );
    const conversionResult = await testDb.withTx(db =>
      duplicateInvoice(db, quotation.id as number, InvoiceType.invoice)
    );

    expect(conversionResult.success).toBe(true);
    expect((conversionResult.data as Invoice).invoiceType).toBe(InvoiceType.quotation);
    expect((conversionResult.data as Invoice).invoiceNumber).toBe('000005');
    expect(
      (await testDb.withTx(db => getNextSequence(db, { businessId, clientId, invoiceType: InvoiceType.invoice }))).data
    ).toEqual({
      nextSequence: 6,
      formattedSequence: '000006'
    });

    const repeatedConversionResult = await testDb.withTx(db =>
      duplicateInvoice(db, quotation.id as number, InvoiceType.invoice)
    );
    expect(repeatedConversionResult.success).toBe(true);
    expect((repeatedConversionResult.data as Invoice).invoiceType).toBe(InvoiceType.quotation);
    expect((repeatedConversionResult.data as Invoice).invoiceNumber).toBe('000005');
    const repeatedInvoice = await testDb.withTx(db =>
      db.get(
        `SELECT "id" FROM invoices WHERE "businessId" = ? AND "clientId" = ? AND "invoiceType" = ? AND "invoiceNumber" = ?`,
        [businessId, clientId, InvoiceType.invoice, '000006']
      )
    );
    expect(repeatedInvoice).toBeDefined();
    expect(
      (await testDb.withTx(db => getNextSequence(db, { businessId, clientId, invoiceType: InvoiceType.invoice }))).data
    ).toEqual({
      nextSequence: 7,
      formattedSequence: '000007'
    });
    expect(conversionSequenceBefore.data).toBeUndefined();
  });

  it('does not increment sequence when updating an existing invoice', async () => {
    const businessId = await insertBusiness(testDb, 'Business G', 'BG');
    const clientId = await insertClient(testDb, 'Client G', 'CG');
    const currencyId = await getCurrencyId(testDb, 'USD');

    const addResult = await testDb.withTx(db =>
      addInvoice(db, createInvoicePayload(businessId, clientId, currencyId, '000005'))
    );
    expect(addResult.success).toBe(true);

    const sequenceBeforeUpdate = await testDb.withTx(db =>
      getNextSequence(db, {
        businessId,
        clientId,
        invoiceType: InvoiceType.invoice
      })
    );
    expect(sequenceBeforeUpdate.data).toEqual({
      nextSequence: 6,
      formattedSequence: '000006'
    });

    const invoice = addResult.data as Invoice;
    const updateResult = await testDb.withTx(db =>
      updateInvoice(db, {
        ...invoice,
        customerNotes: 'Updated note'
      })
    );
    expect(updateResult.success).toBe(true);

    const sequenceAfterUpdate = await testDb.withTx(db =>
      getNextSequence(db, {
        businessId,
        clientId,
        invoiceType: InvoiceType.invoice
      })
    );
    expect(sequenceAfterUpdate.data).toEqual({
      nextSequence: 6,
      formattedSequence: '000006'
    });
  });

  it('updates sequence when invoice number changes during update', async () => {
    const businessId = await insertBusiness(testDb, 'Business H', 'BH');
    const clientId = await insertClient(testDb, 'Client H', 'CH');
    const currencyId = await getCurrencyId(testDb, 'USD');

    const addResult = await testDb.withTx(db =>
      addInvoice(db, createInvoicePayload(businessId, clientId, currencyId, '000005'))
    );
    expect(addResult.success).toBe(true);

    const invoice = addResult.data as Invoice;
    const updateResult = await testDb.withTx(db =>
      updateInvoice(db, {
        ...invoice,
        invoiceNumber: '000010'
      })
    );
    expect(updateResult.success).toBe(true);

    const sequenceAfterUpdate = await testDb.withTx(db =>
      getNextSequence(db, {
        businessId,
        clientId,
        invoiceType: InvoiceType.invoice
      })
    );
    expect(sequenceAfterUpdate.data).toEqual({
      nextSequence: 11,
      formattedSequence: '000011'
    });
  });

  it('accepts payments carrying a client-generated id that is out of range for int4', async () => {
    const businessId = await insertBusiness(testDb, 'Business H', 'BH');
    const clientId = await insertClient(testDb, 'Client H', 'CH');
    const currencyId = await getCurrencyId(testDb, 'USD');

    const clientSideId = 1789564960373;
    const payload = createInvoicePayload(businessId, clientId, currencyId, '1');
    payload.invoiceBusinessSnapshot.businessShortName = 'BH';
    payload.invoicePayments = [
      {
        id: clientSideId,
        paidAt: new Date().toISOString(),
        paymentMethod: 'Cash',
        amountCents: '4000'
      } as NewInvoicePayload['invoicePayments'][number]
    ];

    const added = await testDb.withTx(db => addInvoice(db, payload));
    expect(added.success).toBe(true);

    const stored = added.data as Invoice;
    expect(stored.invoicePayments).toHaveLength(1);
    expect(stored.invoicePayments?.[0].id).not.toBe(clientSideId);

    const updated = await testDb.withTx(db =>
      updateInvoice(db, {
        ...stored,
        invoicePayments: [
          ...(stored.invoicePayments ?? []),
          {
            id: clientSideId + 1,
            paidAt: new Date().toISOString(),
            paymentMethod: 'Cash',
            amountCents: '1000'
          } as NewInvoicePayload['invoicePayments'][number]
        ]
      })
    );
    expect(updated.success).toBe(true);
    expect((updated.data as Invoice).invoicePayments).toHaveLength(2);
  });
});

// Characterisation tests (plan 2.1): pin what the service does today for the behaviour Phase 2
// intends to keep. Numbering and browser-built snapshots change under D17, so they are `it.todo`
// notes below rather than pinned assertions.
describe('invoice persistence (characterisation)', () => {
  let testDb: PgTestDb;

  beforeAll(async () => {
    testDb = await createPgTestDb();
  });

  afterAll(async () => {
    await testDb.drop();
  });

  const scope = async (tag: string) => ({
    businessId: await insertBusiness(testDb, `Business ${tag}`, tag),
    clientId: await insertClient(testDb, `Client ${tag}`, tag),
    currencyId: await getCurrencyId(testDb, 'USD')
  });

  const lineItem = (itemId: number, unitPriceCents: string, quantity: string, taxRate = 0) =>
    ({
      itemId,
      quantity,
      taxRate,
      invoiceItemSnapshot: { parentInvoiceItemId: 0, itemName: `Item ${itemId}`, unitPriceCents, unitName: 'pcs' }
    }) as unknown as NonNullable<NewInvoicePayload['invoiceItems']>[number];

  const insertItem = (name: string) =>
    testDb.withTx(db => db.run(`INSERT INTO items ("name", "amount") VALUES (?, ?)`, [name, '1000'], true));

  const payments = (...amounts: string[]) =>
    amounts.map(
      amountCents =>
        ({ paidAt: new Date().toISOString(), paymentMethod: 'Cash', amountCents }) as unknown as NonNullable<
          NewInvoicePayload['invoicePayments']
        >[number]
    );

  it('stores the discount, surcharge and shipping the browser sends, without recomputing them', async () => {
    const { businessId, clientId, currencyId } = await scope('DS');
    const payload = createInvoicePayload(businessId, clientId, currencyId, '000001');
    payload.discountName = 'Launch';
    payload.discountType = DiscountType.percentage;
    payload.discountPercent = 10;
    payload.discountAmountCents = '0';
    payload.surchargeName = 'Rush';
    payload.surchargeType = DiscountType.fixed;
    payload.surchargeAmountCents = '750';
    payload.shippingFeeCents = '1500';

    const added = await testDb.withTx(db => addInvoice(db, payload));
    expect(added.success).toBe(true);

    const stored = added.data as Invoice;
    expect({
      discountName: stored.discountName,
      discountType: stored.discountType,
      discountPercent: Number(stored.discountPercent),
      discountAmountCents: String(stored.discountAmountCents),
      surchargeName: stored.surchargeName,
      surchargeType: stored.surchargeType,
      surchargeAmountCents: String(stored.surchargeAmountCents),
      shippingFeeCents: String(stored.shippingFeeCents)
    }).toEqual({
      discountName: 'Launch',
      discountType: DiscountType.percentage,
      discountPercent: 10,
      discountAmountCents: '0',
      surchargeName: 'Rush',
      surchargeType: DiscountType.fixed,
      surchargeAmountCents: '750',
      shippingFeeCents: '1500'
    });
  });

  it('stores line items with their snapshot, keeping the unit price as sent', async () => {
    const { businessId, clientId, currencyId } = await scope('LI');
    const itemId = await insertItem('Widget');
    const payload = createInvoicePayload(businessId, clientId, currencyId, '000001');
    payload.invoiceItems = [lineItem(itemId, '12345', '3', 18)];

    const stored = (await testDb.withTx(db => addInvoice(db, payload))).data as Invoice;
    expect(stored.invoiceItems).toHaveLength(1);
    expect(String(stored.invoiceItems![0].quantity)).toBe('3');
    expect(Number(stored.invoiceItems![0].taxRate)).toBe(18);
    expect(String(stored.invoiceItems![0].invoiceItemSnapshot!.unitPriceCents)).toBe('12345');
    expect(stored.invoiceItems![0].invoiceItemSnapshot!.itemName).toBe(`Item ${itemId}`);
  });

  it('keeps every partial payment as its own row and leaves the status to the caller', async () => {
    const { businessId, clientId, currencyId } = await scope('PP');
    const payload = createInvoicePayload(businessId, clientId, currencyId, '000001');
    payload.status = InvoiceStatus.partiallyPaid;
    payload.invoicePayments = payments('2500', '1000');

    const stored = (await testDb.withTx(db => addInvoice(db, payload))).data as Invoice;
    expect(stored.invoicePayments).toHaveLength(2);
    expect(stored.invoicePayments!.reduce((sum, p) => sum + Number(p.amountCents), 0)).toBe(3500);
    // The service never derives the status from the payments; it stores what it was given.
    expect(stored.status).toBe(InvoiceStatus.partiallyPaid);
  });

  it('sets paidAt for paid, closedAt for closed, and neither for unpaid or partially paid', async () => {
    const { businessId, clientId, currencyId } = await scope('ST');

    const withStatus = async (status: InvoiceStatus, invoiceNumber: string) => {
      const payload = createInvoicePayload(businessId, clientId, currencyId, invoiceNumber);
      payload.status = status;
      const stored = (await testDb.withTx(db => addInvoice(db, payload))).data as Invoice;
      return { paidAt: Boolean(stored.paidAt), closedAt: Boolean(stored.closedAt) };
    };

    expect(await withStatus(InvoiceStatus.paid, '000001')).toEqual({ paidAt: true, closedAt: false });
    expect(await withStatus(InvoiceStatus.closed, '000002')).toEqual({ paidAt: false, closedAt: true });
    expect(await withStatus(InvoiceStatus.unpaid, '000003')).toEqual({ paidAt: false, closedAt: false });
    expect(await withStatus(InvoiceStatus.partiallyPaid, '000004')).toEqual({ paidAt: false, closedAt: false });
  });

  it('moves an invoice between statuses on update, clearing the timestamp that no longer applies', async () => {
    const { businessId, clientId, currencyId } = await scope('SU');
    const added = (
      await testDb.withTx(db => addInvoice(db, createInvoicePayload(businessId, clientId, currencyId, '000001')))
    ).data as Invoice;

    const paid = (await testDb.withTx(db => updateInvoice(db, { ...added, status: InvoiceStatus.paid })))
      .data as Invoice;
    expect(Boolean(paid.paidAt)).toBe(true);
    expect(Boolean(paid.closedAt)).toBe(false);

    const closed = (await testDb.withTx(db => updateInvoice(db, { ...paid, status: InvoiceStatus.closed })))
      .data as Invoice;
    expect(Boolean(closed.paidAt)).toBe(false);
    expect(Boolean(closed.closedAt)).toBe(true);
  });

  it('stores the business, client and currency snapshots the browser built', async () => {
    const { businessId, clientId, currencyId } = await scope('SN');
    const payload = createInvoicePayload(businessId, clientId, currencyId, '000001');
    payload.invoiceBusinessSnapshot.businessName = 'Snapshot Co';
    payload.invoiceBusinessSnapshot.businessEmail = 'books@snapshot.test';
    payload.invoiceClientSnapshot.clientName = 'Snapshot Client';
    payload.invoiceClientSnapshot.clientEmail = 'ap@client.test';

    const stored = (await testDb.withTx(db => addInvoice(db, payload))).data as Invoice;
    expect(stored.invoiceBusinessSnapshot).toMatchObject({
      businessName: 'Snapshot Co',
      businessEmail: 'books@snapshot.test'
    });
    expect(stored.invoiceClientSnapshot).toMatchObject({
      clientName: 'Snapshot Client',
      clientEmail: 'ap@client.test'
    });
    expect(stored.invoiceCurrencySnapshot).toMatchObject({
      currencyCode: 'USD',
      currencySymbol: '$',
      currencySubunit: 100
    });
  });

  it('copies notes, items and snapshots into a duplicate, but not its payments', async () => {
    const { businessId, clientId, currencyId } = await scope('DU');
    const itemId = await insertItem('Duplicated widget');
    const payload = createInvoicePayload(businessId, clientId, currencyId, '000001');
    payload.customerNotes = 'Thanks for your business';
    payload.termsConditionNotes = 'Net 30';
    payload.shippingFeeCents = '900';
    payload.invoiceItems = [lineItem(itemId, '5000', '2')];
    payload.invoicePayments = payments('1000');

    const original = (await testDb.withTx(db => addInvoice(db, payload))).data as Invoice;
    const duplicated = await testDb.withTx(db => duplicateInvoice(db, original.id as number, InvoiceType.invoice));
    expect(duplicated.success).toBe(true);

    const copy = await testDb.withTx(db =>
      db.get<{ id: number; customerNotes: string; termsConditionNotes: string; shippingFeeCents: string }>(
        `SELECT "id", "customerNotes", "termsConditionNotes", "shippingFeeCents"
         FROM invoices WHERE "businessId" = ? AND "invoiceNumber" = ?`,
        [businessId, '000002']
      )
    );
    expect(copy).toMatchObject({
      customerNotes: 'Thanks for your business',
      termsConditionNotes: 'Net 30',
      shippingFeeCents: '900'
    });

    const counts = await testDb.withTx(async db => ({
      items: await db.get<{ count: string }>(`SELECT count(*) FROM invoice_items WHERE "parentInvoiceId" = ?`, [
        copy!.id
      ]),
      payments: await db.get<{ count: string }>(`SELECT count(*) FROM invoice_payments WHERE "parentInvoiceId" = ?`, [
        copy!.id
      ])
    }));
    expect(Number(counts.items!.count)).toBe(1);
    // A duplicate starts unpaid: the original's payments are deliberately not carried over.
    expect(Number(counts.payments!.count)).toBe(0);
  });

  // D17: the server, not the browser, owns these once Phase 2 lands.
  it.todo('D17: assigns the number at issue, per office and financial year, leaving drafts unnumbered');
  it.todo('D17: rebuilds the business, client, office and currency snapshots server-side at issue');
  it.todo('D17: validates the issue date against the IST calendar: chronological and not in the future');
});
