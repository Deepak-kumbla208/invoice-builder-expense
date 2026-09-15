// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DatabaseAdapter } from '../shared/types/DatabaseAdapter';
import { createPgTestDb, type PgTestDb } from './helpers/pgTestDb';

type LayoutRow = { id: number; schema: string; isArchived: number | boolean };

describe('baseline layout seeds', () => {
  let testDb: PgTestDb;
  let db: DatabaseAdapter;

  beforeAll(async () => {
    testDb = await createPgTestDb();
    db = testDb.db;
  });

  afterAll(async () => {
    await testDb.drop();
  });

  it('seeds active and archived built-in layouts', async () => {
    const layouts = await db.all<LayoutRow>('SELECT "id", "schema", "isArchived" FROM layouts ORDER BY "id"');
    const names = layouts.map(layout => JSON.parse(layout.schema).meta.name);

    expect(names).toEqual(
      expect.arrayContaining(['Classic', 'Modern', 'Compact', 'Legacy Classic', 'Legacy Modern', 'Legacy Compact'])
    );
    expect(layouts).toHaveLength(6);

    const archivedByName = new Map(
      layouts.map(layout => [JSON.parse(layout.schema).meta.name as string, Boolean(layout.isArchived)])
    );
    expect(archivedByName.get('Classic')).toBe(false);
    expect(archivedByName.get('Modern')).toBe(false);
    expect(archivedByName.get('Compact')).toBe(false);
    expect(archivedByName.get('Legacy Classic')).toBe(true);
    expect(archivedByName.get('Legacy Modern')).toBe(true);
    expect(archivedByName.get('Legacy Compact')).toBe(true);

    for (const layout of layouts) {
      expect(JSON.parse(layout.schema)).toMatchObject({ schemaVersion: 1, meta: { name: expect.any(String) } });
    }

    const classic = layouts.find(layout => JSON.parse(layout.schema).meta.name === 'Classic');
    const classicHeader = JSON.parse(classic?.schema ?? '{}').sections.find(
      (section: { type: string }) => section.type === 'header'
    );

    expect(classicHeader.blocks[0].children).toEqual([
      expect.objectContaining({ type: 'column', width: '50%' }),
      expect.objectContaining({ type: 'column', width: '50%' })
    ]);
    expect(classicHeader.blocks[0].children[0].children[0]).toMatchObject({ type: 'row', gap: 5 });
    expect(classicHeader.blocks[1]).toMatchObject({ type: 'row', paddingTop: 20 });

    expect(JSON.parse(classic?.schema ?? '{}').sections.map((section: { type: string }) => section.type)).toEqual([
      'watermark',
      'header',
      'itemsTable',
      'financialTotals',
      'paymentInfo',
      'notes',
      'signature',
      'pageCounter'
    ]);

    const legacyClassic = layouts.find(layout => JSON.parse(layout.schema).meta.name === 'Legacy Classic');
    const legacyHeader = JSON.parse(legacyClassic?.schema ?? '{}').sections.find(
      (section: { type: string }) => section.type === 'header'
    );

    expect(legacyHeader.blocks[0].children[0].children[0]).toMatchObject({ type: 'row', gap: 5 });
    expect(legacyHeader.blocks[1].children[1]).toMatchObject({ type: 'column', width: '50%', align: 'end' });
    expect(legacyHeader.blocks[1].children[1].children[0]).toMatchObject({
      type: 'paymentInfo',
      width: '60%',
      paymentSource: 'legacyBusiness'
    });

    expect(JSON.parse(classic?.schema ?? '{}').meta.description).toContain('bank payment information');
    expect(JSON.parse(legacyClassic?.schema ?? '{}').meta.description).toContain('Do not use for new invoices');
  });
});
