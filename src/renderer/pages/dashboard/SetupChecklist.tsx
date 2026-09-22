import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Skeleton,
  Typography
} from '@mui/material';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getApi } from '../../shared/api/restApi';
import { useApiQuery } from '../../shared/hooks/ayncAction/useApiCall';

const fetchCompanies = () => getApi().getAllBusinesses();
const fetchOffices = () => getApi().getOffices();
const fetchBanks = () => getApi().getAllBanks();
const fetchUsers = () => getApi().getUsers();
const fetchClients = () => getApi().getAllClients();
const fetchItems = () => getApi().getAllItems();

const quiet = { showLoader: false };

export interface SetupCounts {
  companies: number;
  officesWithGstin: number;
  banks: number;
  users: number;
  customers: number;
  items: number;
}

export const setupSteps = (counts: SetupCounts) => [
  { id: 'company', done: counts.companies > 0, path: '/companies' },
  { id: 'office', done: counts.officesWithGstin > 0, path: '/offices' },
  { id: 'bank', done: counts.banks > 0, path: '/banks' },
  { id: 'users', done: counts.users > 1, path: '/users' },
  {
    id: 'customers',
    done: counts.customers > 0 && counts.items > 0,
    path: counts.customers > 0 ? '/items' : '/clients'
  }
];

export const SetupChecklist: FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const companies = useApiQuery(fetchCompanies, quiet);
  const offices = useApiQuery(fetchOffices, quiet);
  const banks = useApiQuery(fetchBanks, quiet);
  const users = useApiQuery(fetchUsers, quiet);
  const customers = useApiQuery(fetchClients, quiet);
  const items = useApiQuery(fetchItems, quiet);

  const loaded = [companies, offices, banks, users, customers, items].every(query => !query.loading);
  if (!loaded) return <Skeleton variant="rounded" height={320} />;

  const steps = setupSteps({
    companies: (companies.data ?? []).filter(company => !company.isArchived).length,
    officesWithGstin: (offices.data ?? []).filter(office => !office.isArchived && office.gstin).length,
    banks: (banks.data ?? []).length,
    users: (users.data ?? []).filter(user => user.isActive).length,
    customers: (customers.data ?? []).length,
    items: (items.data ?? []).length
  });
  const done = steps.filter(step => step.done).length;

  if (done === steps.length) return <Alert severity="success">{t('dashboard.setupComplete')}</Alert>;

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 720 }}>
      <Typography variant="h6" component="h2">
        {t('dashboard.setupTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t('dashboard.setupSubtitle')}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
        <LinearProgress
          variant="determinate"
          value={(done / steps.length) * 100}
          sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
          aria-label={t('dashboard.setupProgress', { done, total: steps.length })}
        />
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {t('dashboard.setupProgress', { done, total: steps.length })}
        </Typography>
      </Box>
      <List>
        {steps.map((step, index) => (
          <ListItem
            key={step.id}
            divider={index < steps.length - 1}
            secondaryAction={
              !step.done && (
                <Button size="small" variant="outlined" onClick={() => navigate(step.path)}>
                  {t('dashboard.go')}
                </Button>
              )
            }
            sx={{ pr: 12 }}
          >
            <ListItemIcon>
              {step.done ? (
                <CheckCircleIcon color="success" titleAccess={t('dashboard.done')} />
              ) : (
                <RadioButtonUncheckedIcon color="disabled" titleAccess={t('dashboard.todo')} />
              )}
            </ListItemIcon>
            <ListItemText
              primary={`${index + 1}. ${t(`dashboard.steps.${step.id}.title`)}`}
              secondary={t(`dashboard.steps.${step.id}.description`)}
            />
          </ListItem>
        ))}
      </List>
    </Paper>
  );
};
