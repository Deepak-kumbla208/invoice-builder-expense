import { FilterType } from '../../shared/enums/filterType';
import type { FilterData } from '../../shared/types/invoiceFilter';

type SqlFragment = { sql: string; params: unknown[] };

export const getWhereClauseFromFilters = (data: {
  filters: FilterData[];
  archivedColumn?: string;
  clientNameSnapshotColumn?: string;
  businessNameSnapshotColumn?: string;
  issuedAtColumn?: string;
  statusColumn?: string;
}): SqlFragment => {
  const {
    filters,
    archivedColumn,
    clientNameSnapshotColumn,
    businessNameSnapshotColumn,
    issuedAtColumn,
    statusColumn
  } = data;

  const clauses: string[] = [];
  const params: unknown[] = [];

  filters.forEach(({ type, value }) => {
    switch (type) {
      case FilterType.active:
        if (archivedColumn) clauses.push(`${archivedColumn} = false`);
        break;
      case FilterType.archived:
        if (archivedColumn) clauses.push(`${archivedColumn} = true`);
        break;
      case FilterType.client:
        if (clientNameSnapshotColumn && value) {
          clauses.push(`${clientNameSnapshotColumn} = ?`);
          params.push(value);
        }
        break;
      case FilterType.business:
        if (businessNameSnapshotColumn && value) {
          clauses.push(`${businessNameSnapshotColumn} = ?`);
          params.push(value);
        }
        break;
      case FilterType.date:
        if (issuedAtColumn && value) {
          const dates = value.split(',');
          if (dates.length === 2) {
            clauses.push(`${issuedAtColumn} BETWEEN ? AND ?`);
            params.push(dates[0], dates[1]);
          }
        }
        break;
      case FilterType.status:
        if (statusColumn && value) {
          clauses.push(`${statusColumn} = ?`);
          params.push(value);
        }
        break;
      case FilterType.all:
      default:
        break;
    }
  });

  return { sql: clauses.length ? clauses.join(' AND ') : '1=1', params };
};

export const getHavingClauseFromFilters = (data: {
  filters: FilterData[];
  invoiceUpdatedAtColumn?: string;
  invoiceIdColumn?: string;
  archivedColumn?: string;
  clientNameSnapshotColumn?: string;
  businessNameSnapshotColumn?: string;
  issuedAtColumn?: string;
  statusColumn?: string;
}): SqlFragment => {
  const {
    filters,
    invoiceUpdatedAtColumn,
    issuedAtColumn,
    invoiceIdColumn,
    archivedColumn,
    businessNameSnapshotColumn,
    clientNameSnapshotColumn,
    statusColumn
  } = data;

  if (!filters?.length) return { sql: '', params: [] };

  const clauses: string[] = [];
  const params: unknown[] = [];

  filters.forEach(({ type, value }) => {
    switch (type) {
      case FilterType.noInvoices30:
        if (invoiceUpdatedAtColumn)
          clauses.push(
            `(MAX(${invoiceUpdatedAtColumn}) IS NULL OR MAX(${invoiceUpdatedAtColumn}) < NOW() - INTERVAL '30 days')`
          );
        break;
      case FilterType.noInvoices60:
        if (invoiceUpdatedAtColumn)
          clauses.push(
            `(MAX(${invoiceUpdatedAtColumn}) IS NULL OR MAX(${invoiceUpdatedAtColumn}) < NOW() - INTERVAL '60 days')`
          );
        break;
      case FilterType.noInvoices90:
        if (invoiceUpdatedAtColumn)
          clauses.push(
            `(MAX(${invoiceUpdatedAtColumn}) IS NULL OR MAX(${invoiceUpdatedAtColumn}) < NOW() - INTERVAL '90 days')`
          );
        break;
      case FilterType.noInvoices:
        if (invoiceIdColumn) clauses.push(`(COUNT(${invoiceIdColumn}) = 0)`);
        break;
      case FilterType.atleastOneInvoice:
        if (invoiceIdColumn) clauses.push(`(COUNT(${invoiceIdColumn}) > 0)`);
        break;
      case FilterType.active:
        if (archivedColumn) clauses.push(`(${archivedColumn} = false)`);
        break;
      case FilterType.archived:
        if (archivedColumn) clauses.push(`(${archivedColumn} = true)`);
        break;
      case FilterType.client:
        if (clientNameSnapshotColumn) {
          clauses.push(`${clientNameSnapshotColumn} = ?`);
          params.push(value);
        }
        break;
      case FilterType.business:
        if (businessNameSnapshotColumn) {
          clauses.push(`${businessNameSnapshotColumn} = ?`);
          params.push(value);
        }
        break;
      case FilterType.date: {
        const dates = value.split(',');
        if (dates.length === 2 && issuedAtColumn) {
          clauses.push(`${issuedAtColumn} BETWEEN ? AND ?`);
          params.push(dates[0], dates[1]);
        }
        break;
      }
      case FilterType.status:
        if (statusColumn) {
          clauses.push(`${statusColumn} = ?`);
          params.push(value);
        }
        break;
      case FilterType.all:
      default:
        break;
    }
  });

  if (!clauses.length) return { sql: '', params: [] };

  return { sql: `HAVING ${clauses.join(' AND ')}`, params };
};
