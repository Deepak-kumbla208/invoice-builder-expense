import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Button } from '@mui/material';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { NoItem } from '../../shared/components/lists/noItem/NoItem';

interface Props {
  message?: string;
  backTo?: string;
  backLabel?: string;
}

export const NoAccess: FC<Props> = ({ message, backTo = '/', backLabel }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <NoItem
      text={message ?? t('noAccess.record')}
      icon={<LockOutlinedIcon color="action" fontSize="large" />}
      node={
        <Button variant="contained" onClick={() => navigate(backTo)}>
          {backLabel ?? t('noAccess.backToList')}
        </Button>
      }
    />
  );
};
