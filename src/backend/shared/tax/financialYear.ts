import type { DocumentType } from './types';

/** D20: `ABCCN/25-26/9999` is the longest the format can produce. */
export const MAX_DOC_NUMBER_LENGTH = 16;

const DOC_TYPE_TOKEN: Record<DocumentType, string> = {
  invoice: '',
  credit_note: 'CN',
  quotation: 'Q'
};

const IST_OFFSET_MINUTES = 5 * 60 + 30;

const IST_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The IST calendar date for an ISO string. A date-only string is already a calendar date and is
 * taken as-is; a timestamp is shifted into IST first, so 2026-03-31T20:00:00Z is 1 April in India.
 */
const istParts = (dateISO: string): { year: number; month: number } => {
  const dateOnly = IST_DATE.exec(dateISO);
  if (dateOnly) return { year: Number(dateOnly[1]), month: Number(dateOnly[2]) };

  const parsed = new Date(dateISO);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date: ${dateISO}`);
  const ist = new Date(parsed.getTime() + IST_OFFSET_MINUTES * 60_000);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth() + 1 };
};

/**
 * The Indian financial year as `YY-YY`, starting 1 April: 2026-03-31 is '25-26' and 2026-04-01 is
 * '26-27'.
 */
export const financialYear = (dateISO: string): string => {
  const { year, month } = istParts(dateISO);
  const startYear = month >= 4 ? year : year - 1;
  const pad = (value: number) => String(value % 100).padStart(2, '0');
  return `${pad(startYear)}-${pad(startYear + 1)}`;
};

/**
 * D20: `{code}{T}/{YY-YY}/{seq4}`, where T is empty for invoices, `CN` for credit notes and `Q`
 * for quotations. Throws rather than returning something that will not fit the column or the PDF.
 */
export const formatDocNumber = (code: string, docType: DocumentType, fy: string, seq: number): string => {
  const number = `${code}${DOC_TYPE_TOKEN[docType]}/${fy}/${String(seq).padStart(4, '0')}`;
  if (number.length > MAX_DOC_NUMBER_LENGTH) {
    throw new Error(
      `Document number "${number}" is ${number.length} characters, over the ${MAX_DOC_NUMBER_LENGTH} allowed`
    );
  }
  return number;
};
