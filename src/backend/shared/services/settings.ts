import type { Db } from '../db/tx';
import type { Settings } from '../types/settings';
import { prepareUpdate } from '../utils/dbHelper';
import { mapDatabaseError } from '../utils/errorFunctions';

export const getAllSettings = async (db: Db) => {
  const row = await db.get('SELECT * FROM settings LIMIT 1');

  if (!row) return { success: true, data: null };
  return { success: true, data: row };
};

export const updateSettings = async (db: Db, data: Settings) => {
  try {
    const { createdAt, updatedAt, id, ...rest } = data;
    void createdAt;
    void updatedAt;
    void id;

    const { fields, params } = prepareUpdate(rest);
    if (!fields.length) return { success: true };

    fields.push(`"updatedAt" = NOW()`);

    await db.run(`UPDATE settings SET ${fields.join(', ')} WHERE id = (SELECT "id" FROM settings LIMIT 1)`, params);
    return { success: true };
  } catch (error) {
    return { success: false, ...mapDatabaseError(error) };
  }
};
