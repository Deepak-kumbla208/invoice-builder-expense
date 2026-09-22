import { Alert, Button, TextField, Typography } from '@mui/material';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router-dom';
import { getApi } from '../../shared/api/restApi';
import { safeReturnTo, withReturnTo } from '../../shared/utils/authFunctions';
import { useAppDispatch, useAppSelector } from '../../state/configureStore';
import { selectAuthStatus, selectAuthUser, setProfile } from '../../state/authSlice';
import { AuthCard } from './AuthCard';

export const LoginPage: FC = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectAuthStatus);
  const user = useAppSelector(selectAuthUser);
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get('returnTo'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated' && user) {
    return <Navigate to={user.mustChangePassword ? withReturnTo('/change-password', returnTo) : returnTo} replace />;
  }

  const onSubmit = async () => {
    if (submitting) return;
    if (!email.trim() || !password) {
      setError(t('auth.credentialsRequired'));
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await getApi().login({ email: email.trim(), password });
      if (response.success && response.data) {
        dispatch(setProfile(response.data));
        return;
      }
      setPassword('');
      setError(t(response.key ?? 'auth.invalidCredentials'));
    } catch {
      setError(t('auth.serverUnavailable'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard title={t('auth.signInTitle')} onSubmit={onSubmit}>
      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}
      <TextField
        label={t('auth.email')}
        type="email"
        autoComplete="username"
        autoFocus
        fullWidth
        value={email}
        onChange={event => setEmail(event.target.value)}
      />
      <TextField
        label={t('auth.password')}
        type="password"
        autoComplete="current-password"
        fullWidth
        value={password}
        onChange={event => setPassword(event.target.value)}
      />
      <Button type="submit" variant="contained" size="large" disabled={submitting} fullWidth>
        {t('auth.signIn')}
      </Button>
      <Typography variant="body2" color="text.secondary">
        {t('auth.forgotPassword')}
      </Typography>
    </AuthCard>
  );
};
