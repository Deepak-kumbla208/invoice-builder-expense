import { FilterType } from '../../shared/enums/filterType';
import type { FilterData } from '../../shared/types/invoiceFilter';

export const parseFilter = (query: string | undefined): FilterData[] | undefined => {
  if (!query) return undefined;

  let parsed: unknown;

  try {
    parsed = JSON.parse(query);
  } catch {
    return undefined;
  }

  if (!Array.isArray(parsed)) return undefined;

  const result: FilterData[] = [];

  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;

    const { type, value } = item;

    if (!Object.values(FilterType).includes(type)) continue;

    if (typeof value !== 'string') continue;

    result.push({ type, value });
  }

  return result.length ? result : undefined;
};
