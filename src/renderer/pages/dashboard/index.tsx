import { Paper, Stack, Typography } from '@mui/material';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '../../shared/hooks/auth/usePermission';
import { useAppSelector } from '../../state/configureStore';
import { selectAuthUser } from '../../state/authSlice';
import { SetupChecklist } from './SetupChecklist';

export const DashboardPage: FC = () => {
  const { t } = useTranslation();
  const user = useAppSelector(selectAuthUser);
  const canSetUp = usePermission({
    all: ['admin.companies', 'admin.offices', 'admin.users', 'admin.invoice_setup', 'customer.view']
  });

  return (
    <Stack spacing={3}>
      <div>
        <Typography variant="h5" component="h1" color="secondary">
          {t('dashboard.welcome', { name: user?.fullName ?? '' })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {user?.roleName}
        </Typography>
      </div>
      {canSetUp ? (
        <SetupChecklist />
      ) : (
        <Paper variant="outlined" sx={{ p: 3, maxWidth: 720 }}>
          <Typography variant="body1">{t('dashboard.placeholder')}</Typography>
        </Paper>
      )}
    </Stack>
  );
};
