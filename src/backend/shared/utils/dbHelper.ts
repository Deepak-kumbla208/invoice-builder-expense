import { DATE_FIELDS } from '../constant';
import type { DbValue } from '../types/dbValue';
import type { UpdateData } from '../types/updateData';

export const convertDateFields = <T extends Record<string, unknown>>(row: T): T => {
  const convertedRow = { ...row } as Record<string, unknown>;

  DATE_FIELDS.forEach(key => {
    if (key in convertedRow && convertedRow[key] != null) {
      const value = convertedRow[key];

      if (value instanceof Date) {
        convertedRow[key] = value.toISOString().replace('T', ' ').replace('Z', '');
      }
    }
  });

  return convertedRow as T;
};

export const convertDateFieldsArray = <T extends Record<string, unknown>>(rows: T[]): T[] =>
  rows.map(convertDateFields);

export const prepareUpdate = (data: UpdateData, id?: number) => {
  const fields: string[] = [];
  const params: (string | number | boolean | null)[] = [];

  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined) {
      fields.push(`"${key}" = ?`);

      let param: string | number | boolean | null;

      if (value === null) param = null;
      else if (typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') param = value;
      else throw new Error(`error.unsupportedValue`);

      params.push(param);
    }
  });

  if (id != null) params.push(id);

  return { fields, params };
};

export const toDbValue = (value: unknown): DbValue => {
  if (value === undefined || value === null) return null;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;

  return JSON.stringify(value);
};
