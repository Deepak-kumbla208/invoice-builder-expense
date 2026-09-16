import type { Db } from '../db/tx';
import type { EntityWithId } from '../types/entityWithId';
import type { FilterData } from '../types/invoiceFilter';
import type { Preset } from '../types/preset';
import type { Response } from '../types/response';
import { mapDatabaseError } from '../utils/errorFunctions';
import { getWhereClauseFromFilters } from '../utils/filterFunctions';

const presetFields: (keyof Preset)[] = [
  'name',
  'businessId',
  'clientId',
  'currencyId',
  'bankId',
  'styleProfilesId',
  'customerNotes',
  'thanksNotes',
  'termsConditionNotes',
  'language',
  'signatureData',
  'signatureSize',
  'signatureType',
  'signatureName',
  'isArchived'
];

type GetPresetsOptions = {
  id?: number;
  filter?: FilterData[];
};

const handleEntity =
  <T extends EntityWithId>(db: Db, table: string, fields: readonly (keyof T)[]) =>
  async (data: T, isUpdate = false): Promise<Response<number>> => {
    const params = fields.map(key => (data[key] ?? null) as string | number | boolean | null);

    try {
      let lastID: number = -1;

      if (isUpdate) {
        const setClause = fields.map(f => `"${String(f)}" = ?`).join(', ') + `, "updatedAt" = NOW()`;

        await db.run(`UPDATE ${table} SET ${setClause} WHERE "id" = ?`, [...params, data.id ?? -1], true);
        lastID = data.id ?? -1;
      } else {
        lastID = await db.run(
          `INSERT INTO ${table} (${fields.map(f => `"${String(f)}"`).join(',')})
           VALUES (${fields.map(() => '?').join(',')})`,
          params,
          true
        );
      }

      return { success: true, data: lastID };
    } catch (error) {
      return { success: false, ...mapDatabaseError(error) };
    }
  };

const getPresets = async (db: Db, options: GetPresetsOptions) => {
  const { id, filter } = options;

  const where = filter
    ? getWhereClauseFromFilters({
        filters: filter,
        archivedColumn: 't."isArchived"'
      })
    : undefined;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (id) {
    conditions.push(`t."id" = ?`);
    params.push(id);
  }
  if (where) {
    conditions.push(where.sql);
    params.push(...where.params);
  }
  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
        SELECT
          t.*,
          bu."name" as "businessName",
          bu."address" as "businessAddress",
          bu."role" as "businessRole",
          bu."shortName" as "businessShortName",
          bu."email" as "businessEmail",
          bu."phone" as "businessPhone",
          bu."additional" as "businessAdditional",
          bu."logo" as "businessLogo",
          bu."fileSize" as "businessFileSize",
          bu."fileSize" as "businessFileSize",
          bu."fileType" as "businessFileType",
          bu."fileName" as "businessFileName",
          bu."vatCode" as "businessVatCode",
          cl."name" as "clientName",
          cl."address" as "clientAddress",
          cl."email" as "clientEmail",
          cl."phone" as "clientPhone",
          cl."code" as "clientCode",
          cl."additional" as "clientAdditional",
          cl."vatCode" as "clientVatCode",
          cur."code" as "currencyCode",
          cur."symbol" as "currencySymbol",
          cur."subunit" as "currencySubunit",
          cur."format" as "currencyFormat",
          ba."name" as "bankLabel",
          ba."bankName" as "bankName",
          ba."accountNumber" as "accountNumber",
          ba."swiftCode" as "swiftCode",
          ba."address" as "address",
          ba."branchCode" as "branchCode",
          ba."type" as "type",
          ba."routingNumber" as "routingNumber",
          ba."accountHolder" as "accountHolder",
          ba."sortOrder" as "sortOrder",
          ba."upiCode" as "upiCode",
          ba."qrCodeFileSize" as "qrCodeFileSize",
          ba."qrCodeFileType" as "qrCodeFileType",
          ba."qrCodeFileName" as "qrCodeFileName",
          ba."qrCode" as "qrCode",
          l."id" as "layoutId",
          l."schema" as "layoutSchema",
          sp."name" as "styleProfileName",
          sp."color" as "styleProfileColor",
          sp."logoSize" as "styleProfileLogoSize",
          sp."fontSize" as "styleProfileFontSize",
          sp."fontFamily" as "styleProfileFontFamily",
          sp."tableHeaderStyle" as "styleProfileTableHeaderStyle",
          sp."tableRowStyle" as "styleProfileTableRowStyle",
          sp."pageFormat" as "styleProfilePageFormat",
          sp."labelUpperCase" as "styleProfileLabelUpperCase",
          sp."showQuantity" as "styleProfileShowQuantity",
          sp."showUnit" as "styleProfileShowUnit",
          sp."showRowNo" as "styleProfileShowRowNo",
          sp."fieldSortOrders" as "styleProfileFieldSortOrders",
          sp."pdfTexts" as "styleProfilePdfTexts",
          sp."watermarkFileName" as "styleProfileWatermarkFileName",
          sp."watermarkFileType" as "styleProfileWatermarkFileType",
          sp."watermarkFileSize" as "styleProfileWatermarkFileSize",
          sp."watermarkFileData" as "styleProfileWatermarkFileData",
          sp."paidWatermarkFileName" as "styleProfilePaidWatermarkFileName",
          sp."paidWatermarkFileType" as "styleProfilePaidWatermarkFileType",
          sp."paidWatermarkFileSize" as "styleProfilePaidWatermarkFileSize",
          sp."paidWatermarkFileData" as "styleProfilePaidWatermarkFileData"
        FROM presets t
        LEFT JOIN style_profiles sp ON sp."id" = t."styleProfilesId"
        LEFT JOIN layouts l ON l."id" = sp."layoutId"
        LEFT JOIN banks ba ON ba."id" = t."bankId"
        LEFT JOIN currencies cur ON cur."id" = t."currencyId"
        LEFT JOIN clients cl ON cl."id" = t."clientId"
        LEFT JOIN businesses bu ON bu."id" = t."businessId"
        ${whereSql}
        ORDER BY t."createdAt" DESC
      `;
  const presets = await db.all<Preset>(sql, params);
  const final = presets.map(preset => {
    return {
      ...preset,
      layoutSchema:
        preset.layoutSchema && typeof preset.layoutSchema === 'string' ? JSON.parse(preset.layoutSchema) : undefined,
      styleProfileFieldSortOrders:
        preset.styleProfileFieldSortOrders && typeof preset.styleProfileFieldSortOrders === 'string'
          ? JSON.parse(preset.styleProfileFieldSortOrders)
          : preset.styleProfileFieldSortOrders,
      styleProfilePdfTexts:
        preset.styleProfilePdfTexts && typeof preset.styleProfilePdfTexts === 'string'
          ? JSON.parse(preset.styleProfilePdfTexts)
          : preset.styleProfilePdfTexts
    };
  });

  return final;
};

export const getAllPresets = async (db: Db, filter?: FilterData[]): Promise<Response<Preset[]>> => {
  const presets = await getPresets(db, { filter });

  return { success: true, data: presets };
};

export const addPreset = async (db: Db, data: Preset): Promise<Response<Preset>> => {
  try {
    const handle = handleEntity<Preset>(db, 'presets', presetFields);
    const result = await handle(data);

    if (!result.success || result.data == undefined) {
      return { success: false, key: result.key };
    }

    const newId = result.data;
    const newResult = await getPresets(db, { id: newId });

    return { success: true, data: newResult.length > 0 ? newResult[0] : undefined };
  } catch (error) {
    return { success: false, ...mapDatabaseError(error) };
  }
};

export const updatePreset = async (db: Db, data: Preset): Promise<Response<Preset>> => {
  try {
    const handle = handleEntity<Preset>(db, 'presets', presetFields);
    const result = await handle(data, true);

    if (!result.success || result.data == undefined) {
      return { success: false, key: result.key };
    }

    const newId = result.data;
    const newResult = await getPresets(db, { id: newId });

    return { success: true, data: newResult.length > 0 ? newResult[0] : undefined };
  } catch (error) {
    return { success: false, ...mapDatabaseError(error) };
  }
};

export const deletePreset = async (db: Db, id: number) => {
  try {
    await db.run('DELETE FROM presets WHERE "id" = ?;', [id]);
    return { success: true };
  } catch (error) {
    return { success: false, ...mapDatabaseError(error) };
  }
};

export const batchAddPreset = async (db: Db, data: Preset[]) => {
  const handle = handleEntity<Preset>(db, 'presets', presetFields);
  try {
    for (const row of data) {
      const result = await handle(row);
      if (!result.success) {
        return result;
      }
    }
    return { success: true };
  } catch (error) {
    return { success: false, ...mapDatabaseError(error) };
  }
};
