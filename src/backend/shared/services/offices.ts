import type { RequestCtx } from '../auth/context';
import type { Db } from '../db/tx';
import { AppError } from '../errors';
import type { OfficeInput, OfficeUpdateInput } from '../validation/admin';
import { writeAudit } from './audit';

export type Office = {
  id: number;
  businessId: number;
  name: string;
  code: string;
  stateCode: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  lutReference: string | null;
  lutValidUntil: string | null;
  isArchived: boolean;
};

const OFFICE_SELECT = `
  SELECT id, business_id AS "businessId", name, code, state_code AS "stateCode", address, phone, email, gstin,
         lut_reference AS "lutReference", to_char(lut_valid_until, 'YYYY-MM-DD') AS "lutValidUntil",
         is_archived AS "isArchived", created_at AS "createdAt", updated_at AS "updatedAt"
  FROM offices`;

const codeTaken = (error: unknown) => {
  if ((error as { code?: string }).code === '23505') {
    return new AppError('conflict', 'office.codeTaken', { code: ['office.codeTaken'] });
  }
  return error;
};

export const listOffices = (db: Db, filter: { businessId?: number } = {}) =>
  filter.businessId
    ? db.all<Office>(`${OFFICE_SELECT} WHERE business_id = ? ORDER BY name`, [filter.businessId])
    : db.all<Office>(`${OFFICE_SELECT} ORDER BY name`);

export const getOffice = (db: Db, id: number) => db.get<Office>(`${OFFICE_SELECT} WHERE id = ?`, [id]);

export const createOffice = async (db: Db, ctx: RequestCtx, input: OfficeInput) => {
  if (!ctx.allOffices) throw new AppError('forbidden', 'office.createRequiresAllOffices');

  const company = await db.get<{ isArchived: boolean }>('SELECT "isArchived" FROM businesses WHERE id = ?', [
    input.businessId
  ]);
  if (!company) throw new AppError('validation', 'office.companyNotFound', { businessId: ['office.companyNotFound'] });
  if (company.isArchived) {
    throw new AppError('validation', 'office.companyArchived', { businessId: ['office.companyArchived'] });
  }

  let id: number;
  try {
    id = await db.run(
      `INSERT INTO offices (business_id, name, code, state_code, address, phone, email, gstin, lut_reference,
                            lut_valid_until, is_archived)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.businessId,
        input.name,
        input.code,
        input.stateCode,
        input.address,
        input.phone,
        input.email,
        input.gstin,
        input.lutReference,
        input.lutValidUntil,
        input.isArchived
      ],
      true
    );
  } catch (error) {
    throw codeTaken(error);
  }

  const office = (await getOffice(db, id))!;
  await writeAudit(db, ctx, {
    action: 'office.create',
    entityType: 'office',
    entityId: id,
    businessId: office.businessId,
    officeId: id,
    after: office
  });
  return office;
};

export const updateOffice = async (db: Db, ctx: RequestCtx, id: number, input: OfficeUpdateInput) => {
  const before = await getOffice(db, id);
  if (!before) throw new AppError('notFound');

  try {
    await db.run(
      `UPDATE offices
       SET name = ?, code = ?, state_code = ?, address = ?, phone = ?, email = ?, gstin = ?, lut_reference = ?,
           lut_valid_until = ?, is_archived = ?, updated_at = now()
       WHERE id = ?`,
      [
        input.name,
        input.code,
        input.stateCode,
        input.address,
        input.phone,
        input.email,
        input.gstin,
        input.lutReference,
        input.lutValidUntil,
        input.isArchived,
        id
      ]
    );
  } catch (error) {
    throw codeTaken(error);
  }

  const office = (await getOffice(db, id))!;
  await writeAudit(db, ctx, {
    action: 'office.update',
    entityType: 'office',
    entityId: id,
    businessId: office.businessId,
    officeId: id,
    before,
    after: office
  });
  return office;
};
