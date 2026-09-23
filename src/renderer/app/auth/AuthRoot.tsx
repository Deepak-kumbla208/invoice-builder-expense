import { Box, CircularProgress } from '@mui/material';
import { useEffect, type FC } from 'react';
import { Outlet } from 'react-router-dom';
import { getApi } from '../../shared/api/restApi';
import { setAuthHandlers } from '../../shared/api/platformApi';
import { useAppDispatch, useAppSelector } from '../../state/configureStore';
import { clearAuth, selectAuthStatus, setMustChangePassword, setProfile } from '../../state/authSlice';

export const AuthRoot: FC = () => {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectAuthStatus);

  useEffect(() => {
    setAuthHandlers({
      onUnauthorized: () => dispatch(clearAuth()),
      onMustChangePassword: () => dispatch(setMustChangePassword(true))
    });

    let active = true;
    getApi()
      .getProfile()
      .then(response => {
        if (!active) return;
        if (response.success && response.data) dispatch(setProfile(response.data));
        else dispatch(clearAuth());
      })
      .catch(() => {
        if (active) dispatch(clearAuth());
      });

    return () => {
      active = false;
      setAuthHandlers({});
    };
  }, [dispatch]);

  if (status === 'unknown') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return <Outlet />;
};
