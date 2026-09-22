import type { RequestCtx } from '../auth/context';
import type { Db } from '../db/tx';
import { AppError } from '../errors';
import type { Business } from '../types/business';
import type { CompanyInput, CompanyUpdateInput } from '../validation/admin';
import { writeAudit } from './audit';
import { addBusiness, updateBusiness } from './businesses';

type CompanyData = Omit<CompanyInput, 'logo'> & { logo: Uint8Array | null };

const snapshot = (db: Db, id: number) =>
  db.get(
    `SELECT id, name, "shortName", legal_name, pan, address, email, phone, website, "vatCode", code, "countryCode",
            default_layout_id, default_style_profile_id, "isArchived"
     FROM businesses WHERE id = ?`,
    [id]
  );

export const createCompany = async (db: Db, ctx: RequestCtx, data: CompanyData) => {
  if (!ctx.allOffices) throw new AppError('forbidden', 'company.createRequiresAllOffices');

  const result = await addBusiness(db, data as unknown as Business);
  const id = result.data?.id;
  if (!result.success || !id) return result;

  await writeAudit(db, ctx, {
    action: 'company.create',
    entityType: 'company',
    entityId: id,
    businessId: id,
    after: await snapshot(db, id)
  });
  return result;
};

export const updateCompany = async (
  db: Db,
  ctx: RequestCtx,
  data: Omit<CompanyUpdateInput, 'logo'> & { logo: Uint8Array | null }
) => {
  const before = await snapshot(db, data.id);
  if (!before) throw new AppError('notFound');

  const result = await updateBusiness(db, data as unknown as Business);
  if (!result.success) return result;

  await writeAudit(db, ctx, {
    action: 'company.update',
    entityType: 'company',
    entityId: data.id,
    businessId: data.id,
    before,
    after: await snapshot(db, data.id)
  });
  return result;
};
