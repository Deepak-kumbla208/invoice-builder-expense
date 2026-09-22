import type { PermissionKey } from '@shared/auth/permissions';
import type { FC, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NoAccess } from '../../pages/noAccess/NoAccess';
import { usePermission } from '../../shared/hooks/auth/usePermission';
import type { PermissionRule } from '../../shared/utils/permissionFunctions';

interface Props {
  rule?: PermissionRule | PermissionKey;
  children: ReactNode;
  fallback?: ReactNode;
}

export const RequirePermission: FC<Props> = ({ rule, children, fallback }) => {
  const { t } = useTranslation();
  const allowed = usePermission(rule);

  if (allowed) return <>{children}</>;
  return (
    <>{fallback ?? <NoAccess message={t('noAccess.page')} backTo="/" backLabel={t('noAccess.backToDashboard')} />}</>
  );
};
