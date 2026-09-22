import LockResetIcon from '@mui/icons-material/LockReset';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  FormControlLabel,
  Grid,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { PermissionGrid } from '../../shared/components/permissions/PermissionGrid';
import { useFormDirtyCheck } from '../../shared/hooks/form/useFormDirtyCheck';
import type { PermissionGroup, Role, User, UserAdd, UserUpdate } from '../../shared/types/admin';
import type { AuthCompany, AuthOffice } from '../../shared/types/auth';
import { validators } from '../../shared/utils/validatorFunctions';
import { useAppSelector } from '../../state/configureStore';
import { selectAuthUser, selectPermissionSet } from '../../state/authSlice';

interface FormState {
  email: string;
  fullName: string;
  roleId: number | '';
  allOffices: boolean;
  officeIds: number[];
  extraPermissions: string[];
  isActive: boolean;
}

interface Props {
  user?: User;
  roles: Role[];
  groups: PermissionGroup[];
  offices: AuthOffice[];
  companies: AuthCompany[];
  onResetPassword: (user: User) => void;
  handleChange: (data: { user: UserAdd | UserUpdate; isFormValid: boolean; description?: string }) => void;
}

const toForm = (user?: User): FormState => ({
  email: user?.email ?? '',
  fullName: user?.fullName ?? '',
  roleId: user?.roleId ?? '',
  allOffices: user?.allOffices ?? false,
  officeIds: user?.officeIds ?? [],
  extraPermissions: user?.extraPermissions ?? [],
  isActive: user?.isActive ?? true
});

export const Form: FC<Props> = ({ user, roles, groups, offices, companies, onResetPassword, handleChange }) => {
  const { t } = useTranslation();
  const currentUser = useAppSelector(selectAuthUser);
  const granted = useAppSelector(selectPermissionSet);
  const initialFormRef = useRef<FormState | undefined>(undefined);
  const [form, setForm] = useState<FormState>(() => toForm(user));
  const [touched, setTouched] = useState<ReadonlySet<keyof FormState>>(new Set());
  const isSelf = user !== undefined && user.id === currentUser?.id;

  useFormDirtyCheck(form, initialFormRef);

  useEffect(() => {
    const initial = toForm(user);
    initialFormRef.current = initial;
    setForm(initial);
    setTouched(new Set());
  }, [user]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setTouched(prev => new Set(prev).add(key));
  };

  const role = roles.find(entry => entry.id === form.roleId);
  const rolePermissions = useMemo(() => new Set(role?.permissions ?? []), [role]);
  const selectedPermissions = useMemo(
    () => new Set([...rolePermissions, ...form.extraPermissions]),
    [rolePermissions, form.extraPermissions]
  );

  const companyNames = useMemo(() => new Map(companies.map(company => [company.id, company.name])), [companies]);
  const officeOptions = useMemo(
    () =>
      offices
        .filter(office => !office.isArchived || form.officeIds.includes(office.id))
        .sort((a, b) =>
          `${companyNames.get(a.businessId)}${a.name}`.localeCompare(`${companyNames.get(b.businessId)}${b.name}`)
        ),
    [offices, form.officeIds, companyNames]
  );
  const selectedOffices = officeOptions.filter(office => form.officeIds.includes(office.id));

  const errors = {
    email: !validators.email(form.email.trim()),
    fullName: form.fullName.trim() === '',
    roleId: form.roleId === '',
    officeIds: !form.allOffices && form.officeIds.length === 0
  };

  const output = useMemo<UserAdd | UserUpdate>(() => {
    const data: UserAdd = {
      email: form.email.trim(),
      fullName: form.fullName.trim(),
      roleId: Number(form.roleId),
      allOffices: form.allOffices,
      officeIds: form.allOffices ? [] : form.officeIds,
      extraPermissions: form.extraPermissions.filter(key => !rolePermissions.has(key))
    };
    return user ? { ...data, id: user.id, isActive: form.isActive } : data;
  }, [form, rolePermissions, user]);

  const isFormValid = !Object.values(errors).some(Boolean);
  const shown = (key: keyof typeof errors) => errors[key] && (user !== undefined || touched.has(key));

  useEffect(() => {
    handleChange({ user: output, isFormValid, description: t('common.invalidForm') });
  }, [output, isFormValid, handleChange, t]);

  const canAssign = (candidate: Role) =>
    candidate.id === user?.roleId || candidate.permissions.every(key => granted.has(key));

  return (
    <Stack spacing={3} sx={{ pb: 2 }}>
      {user && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
          <Chip
            size="small"
            color={user.isActive ? 'success' : 'default'}
            label={user.isActive ? t('users.active') : t('users.inactive')}
          />
          {user.mustChangePassword && <Chip size="small" color="warning" label={t('users.mustChange')} />}
          <Typography variant="body2" color="text.secondary">
            {t('users.lastLogin')}: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : t('users.never')}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          {!isSelf && (
            <Button size="small" startIcon={<LockResetIcon />} onClick={() => onResetPassword(user)}>
              {t('users.resetPassword')}
            </Button>
          )}
        </Stack>
      )}

      {isSelf && <Alert severity="info">{t('users.ownAccess')}</Alert>}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            label={t('users.fullName')}
            required
            fullWidth
            value={form.fullName}
            onChange={event => update('fullName', event.target.value)}
            error={shown('fullName')}
            helperText={shown('fullName') ? t('common.fieldRequired') : undefined}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            label={t('users.email')}
            type="email"
            required
            fullWidth
            value={form.email}
            onChange={event => update('email', event.target.value)}
            error={form.email !== '' && errors.email}
            helperText={form.email !== '' && errors.email ? t('common.invalidEmail') : undefined}
            slotProps={{ htmlInput: { maxLength: 254 } }}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            select
            label={t('users.role')}
            required
            fullWidth
            disabled={isSelf}
            value={form.roleId}
            onChange={event => update('roleId', Number(event.target.value))}
            error={shown('roleId')}
          >
            {roles.map(candidate => (
              <MenuItem key={candidate.id} value={candidate.id} disabled={!canAssign(candidate)}>
                <Stack>
                  <span>{candidate.name}</span>
                  {!canAssign(candidate) && (
                    <Typography variant="caption" color="text.secondary">
                      {t('users.roleCannotAssign')}
                    </Typography>
                  )}
                </Stack>
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        {user && (
          <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', alignItems: 'center' }}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.isActive}
                  disabled={isSelf}
                  onChange={event => update('isActive', event.target.checked)}
                />
              }
              label={t('users.active')}
            />
          </Grid>
        )}
        {currentUser?.allOffices && (
          <Grid size={{ xs: 12 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.allOffices}
                  disabled={isSelf}
                  onChange={event => update('allOffices', event.target.checked)}
                />
              }
              label={t('users.allOffices')}
            />
            <Typography variant="body2" color="text.secondary">
              {t('users.allOfficesHelper')}
            </Typography>
          </Grid>
        )}
        {!form.allOffices && (
          <Grid size={{ xs: 12 }}>
            <Autocomplete
              multiple
              disableCloseOnSelect
              disabled={isSelf}
              options={officeOptions}
              value={selectedOffices}
              groupBy={office => companyNames.get(office.businessId) ?? ''}
              getOptionLabel={office => `${office.name} (${office.code})`}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              onChange={(_event, value) =>
                update(
                  'officeIds',
                  value.map(office => office.id)
                )
              }
              renderInput={params => (
                <TextField
                  {...params}
                  label={t('users.offices')}
                  required
                  error={shown('officeIds')}
                  helperText={shown('officeIds') ? t('user.officesRequired') : t('users.officesHelper')}
                />
              )}
            />
          </Grid>
        )}
      </Grid>

      <Box>
        <Typography variant="h6" component="h2">
          {t('users.extraPermissions')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {role ? t('users.extraPermissionsHelper', { role: role.name }) : t('users.selectRoleFirst')}
        </Typography>
      </Box>

      {role && (
        <PermissionGrid
          groups={groups}
          selected={selectedPermissions}
          locked={rolePermissions}
          grantable={granted}
          disabled={isSelf}
          onChange={next =>
            update(
              'extraPermissions',
              [...next].filter(key => !rolePermissions.has(key))
            )
          }
        />
      )}
    </Stack>
  );
};
