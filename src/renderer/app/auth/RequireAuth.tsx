import type { FC, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { withReturnTo } from '../../shared/utils/authFunctions';
import { useAppSelector } from '../../state/configureStore';
import { selectAuthStatus, selectAuthUser, selectSignedOut } from '../../state/authSlice';

interface Props {
  children: ReactNode;
  allowPasswordChange?: boolean;
}

export const RequireAuth: FC<Props> = ({ children, allowPasswordChange = false }) => {
  const status = useAppSelector(selectAuthStatus);
  const user = useAppSelector(selectAuthUser);
  const signedOut = useAppSelector(selectSignedOut);
  const location = useLocation();
  const here = `${location.pathname}${location.search}`;

  if (status !== 'authenticated' || !user) {
    return <Navigate to={signedOut ? '/login' : withReturnTo('/login', here)} replace />;
  }
  if (user.mustChangePassword && !allowPasswordChange) {
    return <Navigate to={withReturnTo('/change-password', here)} replace />;
  }

  return <>{children}</>;
};
