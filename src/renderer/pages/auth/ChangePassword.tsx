import { MIN_PASSWORD_LENGTH } from '@shared/auth/passwordPolicy';
import { Alert, Button, Stack, TextField } from '@mui/material';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getApi } from '../../shared/api/restApi';
import { useLogout } from '../../shared/hooks/auth/useAuthActions';
import { safeReturnTo } from '../../shared/utils/authFunctions';
import { useAppDispatch, useAppSelector } from '../../state/configureStore';
import { selectAuthUser, setMustChangePassword } from '../../state/authSlice';
import { addToast } from '../../state/pageSlice';
import { AuthCard } from './AuthCard';

type Field = 'currentPassword' | 'newPassword' | 'confirmPassword';

export const ChangePasswordPage: FC = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const logout = useLogout();
  const user = useAppSelector(selectAuthUser);
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get('returnTo'));
  const forced = Boolean(user?.mustChangePassword);
  const [form, setForm] = useState<Record<Field, string>>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: Field, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const validate = () => {
    const next: Partial<Record<Field, string>> = {};
    if (!form.currentPassword) next.currentPassword = t('common.fieldRequired');
    if (form.newPassword.length < MIN_PASSWORD_LENGTH) {
      next.newPassword = t('auth.passwordTooShort', { min: MIN_PASSWORD_LENGTH });
    } else if (form.newPassword === form.currentPassword) {
      next.newPassword = t('auth.passwordUnchanged');
    }
    if (form.confirmPassword !== form.newPassword) next.confirmPassword = t('auth.passwordsDontMatch');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async () => {
    if (submitting || !validate()) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await getApi().changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword
      });
      if (response.success) {
        dispatch(setMustChangePassword(false));
        dispatch(addToast({ message: t('auth.passwordChanged'), severity: 'success' }));
        navigate(returnTo, { replace: true });
        return;
      }
      const fieldErrors = response.errors ?? {};
      setErrors({
        currentPassword: fieldErrors.currentPassword && t(fieldErrors.currentPassword[0]),
        newPassword: fieldErrors.newPassword && t(fieldErrors.newPassword[0])
      });
      if (!fieldErrors.currentPassword && !fieldErrors.newPassword) setError(t(response.key ?? 'error.unknownError'));
    } catch {
      setError(t('auth.serverUnavailable'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      title={t('auth.changePasswordTitle')}
      subtitle={forced ? t('auth.changePasswordForced') : undefined}
      onSubmit={onSubmit}
    >
      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}
      <input type="text" autoComplete="username" value={user?.email ?? ''} readOnly hidden />
      <TextField
        label={t('auth.currentPassword')}
        type="password"
        autoComplete="current-password"
        autoFocus
        fullWidth
        value={form.currentPassword}
        onChange={event => update('currentPassword', event.target.value)}
        error={Boolean(errors.currentPassword)}
        helperText={errors.currentPassword}
      />
      <TextField
        label={t('auth.newPassword')}
        type="password"
        autoComplete="new-password"
        fullWidth
        value={form.newPassword}
        onChange={event => update('newPassword', event.target.value)}
        error={Boolean(errors.newPassword)}
        helperText={errors.newPassword ?? t('auth.passwordTooShort', { min: MIN_PASSWORD_LENGTH })}
      />
      <TextField
        label={t('auth.confirmPassword')}
        type="password"
        autoComplete="new-password"
        fullWidth
        value={form.confirmPassword}
        onChange={event => update('confirmPassword', event.target.value)}
        error={Boolean(errors.confirmPassword)}
        helperText={errors.confirmPassword}
      />
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        {forced ? (
          <Button onClick={logout}>{t('auth.signOut')}</Button>
        ) : (
          <Button onClick={() => navigate(returnTo)}>{t('common.cancel')}</Button>
        )}
        <Button type="submit" variant="contained" disabled={submitting}>
          {t('auth.changePassword')}
        </Button>
      </Stack>
    </AuthCard>
  );
};
