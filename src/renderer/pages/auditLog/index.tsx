import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import {
  Box,
  Collapse,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { Fragment, useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { getApi } from '../../shared/api/restApi';
import { useApiQuery } from '../../shared/hooks/ayncAction/useApiCall';
import type { AuditEntry, AuditQuery } from '../../shared/types/admin';
import { useAppSelector } from '../../state/configureStore';
import { selectAuthCompanies, selectAuthOffices } from '../../state/authSlice';

const PAGE_SIZES = [25, 50, 100];

const JsonBlock: FC<{ label: string; value: unknown }> = ({ label, value }) => (
  <Box sx={{ flex: 1, minWidth: 0 }}>
    <Typography variant="subtitle2" gutterBottom>
      {label}
    </Typography>
    <Box
      component="pre"
      sx={{
        m: 0,
        p: 1.5,
        borderRadius: 1,
        bgcolor: 'action.hover',
        fontSize: 12,
        overflow: 'auto',
        maxHeight: 320
      }}
    >
      {value === null || value === undefined ? '—' : JSON.stringify(value, null, 2)}
    </Box>
  </Box>
);

export const AuditLogPage: FC = () => {
  const { t } = useTranslation();
  const companies = useAppSelector(selectAuthCompanies);
  const offices = useAppSelector(selectAuthOffices);
  const [query, setQuery] = useState<AuditQuery>({ page: 1, pageSize: PAGE_SIZES[1] });
  const [filters, setFilters] = useState({ action: '', entityType: '' });
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchPage = useCallback(() => getApi().getAuditLogs(query), [query]);
  const { data } = useApiQuery(fetchPage);

  const companyNames = useMemo(() => new Map(companies.map(company => [company.id, company.name])), [companies]);
  const officeNames = useMemo(() => new Map(offices.map(office => [office.id, office.name])), [offices]);

  const scopeOf = (entry: AuditEntry) => {
    if (entry.officeId !== null) return officeNames.get(entry.officeId) ?? `#${entry.officeId}`;
    if (entry.businessId !== null) return companyNames.get(entry.businessId) ?? `#${entry.businessId}`;
    return '—';
  };

  const applyFilters = () => {
    const action = filters.action.trim() || undefined;
    const entityType = filters.entityType.trim() || undefined;
    if (action === query.action && entityType === query.entityType) return;
    setExpanded(null);
    setQuery(prev => ({ ...prev, page: 1, action, entityType }));
  };

  const items = data?.items ?? [];

  return (
    <Stack spacing={2} sx={{ height: '100%' }}>
      <Typography variant="h5" component="h1" color="secondary">
        {t('nav.auditLog')}
      </Typography>
      <Stack
        component="form"
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        onSubmit={event => {
          event.preventDefault();
          applyFilters();
        }}
      >
        <TextField
          size="small"
          label={t('auditLog.filterAction')}
          placeholder="user.update"
          value={filters.action}
          onChange={event => setFilters(prev => ({ ...prev, action: event.target.value }))}
          onBlur={applyFilters}
        />
        <TextField
          size="small"
          label={t('auditLog.filterEntity')}
          placeholder="user"
          value={filters.entityType}
          onChange={event => setFilters(prev => ({ ...prev, entityType: event.target.value }))}
          onBlur={applyFilters}
        />
        <button type="submit" hidden />
      </Stack>
      <Paper variant="outlined" sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <TableContainer sx={{ flexGrow: 1 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell>{t('auditLog.time')}</TableCell>
                <TableCell>{t('auditLog.actor')}</TableCell>
                <TableCell>{t('auditLog.action')}</TableCell>
                <TableCell>{t('auditLog.entity')}</TableCell>
                <TableCell>{t('auditLog.scope')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    {t('auditLog.empty')}
                  </TableCell>
                </TableRow>
              )}
              {items.map(entry => {
                const open = expanded === entry.id;
                return (
                  <Fragment key={entry.id}>
                    <TableRow hover sx={{ '& > td': { borderBottom: open ? 'none' : undefined } }}>
                      <TableCell padding="checkbox">
                        <IconButton
                          size="small"
                          aria-label={t('auditLog.details')}
                          aria-expanded={open}
                          onClick={() => setExpanded(open ? null : entry.id)}
                        >
                          {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                        </IconButton>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(entry.occurredAt).toLocaleString()}</TableCell>
                      <TableCell>
                        {entry.actorName ?? t('auditLog.system')}
                        {entry.actorEmail && (
                          <Typography variant="caption" color="text.secondary" component="div">
                            {entry.actorEmail}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{entry.action}</TableCell>
                      <TableCell>{entry.entityType ? `${entry.entityType} #${entry.entityId}` : '—'}</TableCell>
                      <TableCell>{scopeOf(entry)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={6} sx={{ py: 0 }}>
                        <Collapse in={open} timeout="auto" unmountOnExit>
                          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ py: 2 }}>
                            <JsonBlock label={t('auditLog.before')} value={entry.before} />
                            <JsonBlock label={t('auditLog.after')} value={entry.after} />
                          </Stack>
                          <Typography variant="caption" color="text.secondary" component="div" sx={{ pb: 2 }}>
                            {t('auditLog.request', { ip: entry.ip ?? '—', requestId: entry.requestId ?? '—' })}
                          </Typography>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={data?.total ?? 0}
          page={query.page - 1}
          rowsPerPage={query.pageSize}
          rowsPerPageOptions={PAGE_SIZES}
          onPageChange={(_event, page) => {
            setExpanded(null);
            setQuery(prev => ({ ...prev, page: page + 1 }));
          }}
          onRowsPerPageChange={event => {
            setExpanded(null);
            setQuery(prev => ({ ...prev, page: 1, pageSize: Number(event.target.value) }));
          }}
        />
      </Paper>
    </Stack>
  );
};
