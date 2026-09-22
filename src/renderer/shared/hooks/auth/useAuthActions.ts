import { useCallback } from 'react';
import { useAppDispatch } from '../../../state/configureStore';
import { setProfile, signedOut } from '../../../state/authSlice';
import { getApi } from '../../api/restApi';

export const useRefreshProfile = () => {
  const dispatch = useAppDispatch();
  return useCallback(async () => {
    const response = await getApi().getProfile();
    if (response.success && response.data) dispatch(setProfile(response.data));
  }, [dispatch]);
};

export const useLogout = () => {
  const dispatch = useAppDispatch();
  return useCallback(async () => {
    await getApi()
      .logout()
      .catch(() => undefined);
    dispatch(signedOut());
  }, [dispatch]);
};
