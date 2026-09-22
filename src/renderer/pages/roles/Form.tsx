import { Alert, Box, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { PermissionGrid } from '../../shared/components/permissions/PermissionGrid';
import { useFormDirtyCheck } from '../../shared/hooks/form/useFormDirtyCheck';
import type { PermissionGroup, Role } from '../../shared/types/admin';
import { useAppSelector } from '../../state/configureStore';
import { selectPermissionSet } from '../../state/authSlice';

export interface RoleFormData {
  id?: number;
  name: string;
  description: string | null;
  permissions: string[];
  affectedUsers: number;
  permissionsChanged: boolean;
}

interface Props {
  role?: Role;
  groups: PermissionGroup[];
  handleChange: (data: { role: RoleFormData; isFormValid: boolean; description?: string }) => void;
}

interface FormState {
  name: string;
  description: string;
  permissions: string[];
}

const toForm = (role?: Role): FormState => ({
  name: role?.name ?? '',
  description: role?.description ?? '',
  permissions: role?.permissions ?? []
});

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every(key => b.includes(key));

export const Form: FC<Props> = ({ role, groups, handleChange }) => {
  const { t } = useTranslation();
  const granted = useAppSelector(selectPermissionSet);
  const initialFormRef = useRef<FormState | undefined>(undefined);
  const [form, setForm] = useState<FormState>(() => toForm(role));
  const [nameTouched, setNameTouched] = useState(false);
  const selected = useMemo(() => new Set(form.permissions), [form.permissions]);

  useFormDirtyCheck(form, initialFormRef);

  useEffect(() => {
    const initial = toForm(role);
    initialFormRef.current = initial;
    setForm(initial);
    setNameTouched(false);
  }, [role]);

  const output = useMemo<RoleFormData>(
    () => ({
      id: role?.id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      permissions: form.permissions,
      affectedUsers: role?.affectedUsers ?? 0,
      permissionsChanged: !sameSet(form.permissions, role?.permissions ?? [])
    }),
    [form, role]
  );

  useEffect(() => {
    handleChange({ role: output, isFormValid: output.name !== '', description: t('common.invalidForm') });
  }, [output, handleChange, t]);

  const nameMissing = form.name.trim() === '' && (role !== undefined || nameTouched);

  return (
    <Stack spacing={3} sx={{ pb: 2 }}>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 2fr' } }}>
        <TextField
          label={t('roles.name')}
          required
          value={form.name}
          onChange={event => {
            setForm(prev => ({ ...prev, name: event.target.value }));
            setNameTouched(true);
          }}
          error={nameMissing}
          helperText={nameMissing ? t('common.fieldRequired') : undefined}
          slotProps={{ htmlInput: { maxLength: 100 } }}
        />
        <TextField
          label={t('roles.description')}
          value={form.description}
          onChange={event => setForm(prev => ({ ...prev, description: event.target.value }))}
          slotProps={{ htmlInput: { maxLength: 500 } }}
        />
      </Box>

      <Box>
        <Typography variant="h6" component="h2">
          {t('roles.permissions')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('roles.permissionsHelper')}
        </Typography>
      </Box>

      {role?.isSystem && <Alert severity="info">{t('roles.systemLocked')}</Alert>}
      {role && !role.isSystem && role.affectedUsers > 0 && (
        <Alert severity="warning">{t('roles.affects', { count: role.affectedUsers })}</Alert>
      )}

      <PermissionGrid
        groups={groups}
        selected={selected}
        grantable={granted}
        disabled={role?.isSystem}
        onChange={next => setForm(prev => ({ ...prev, permissions: [...next] }))}
      />
    </Stack>
  );
};
