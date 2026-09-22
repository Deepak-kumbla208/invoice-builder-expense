import type { PermissionKey } from '@shared/auth/permissions';
import { useAppSelector } from '../../../state/configureStore';
import { selectPermissionSet } from '../../../state/authSlice';
import { hasPermission, type PermissionRule } from '../../utils/permissionFunctions';

export const usePermission = (rule?: PermissionRule | PermissionKey) => {
  const granted = useAppSelector(selectPermissionSet);
  return hasPermission(granted, rule);
};
