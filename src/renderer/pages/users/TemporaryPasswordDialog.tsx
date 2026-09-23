import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography
} from '@mui/material';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

export interface IssuedPassword {
  name: string;
  password: string;
}

interface Props {
  issued: IssuedPassword | null;
  onClose: () => void;
}

export const TemporaryPasswordDialog: FC<Props> = ({ issued, onClose }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const close = () => {
    setCopied(false);
    onClose();
  };

  return (
    <Dialog open={issued !== null} onClose={(_event, reason) => reason !== 'backdropClick' && close()}>
      <DialogTitle>{t('users.tempPasswordTitle')}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {t('users.tempPasswordText', { name: issued?.name ?? '' })}
        </DialogContentText>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            p: 1.5,
            borderRadius: 1,
            bgcolor: 'action.hover'
          }}
        >
          <Typography
            component="code"
            aria-label={t('users.tempPasswordTitle')}
            sx={{ fontFamily: 'monospace', fontSize: 20, letterSpacing: 1, flexGrow: 1, userSelect: 'all' }}
          >
            {issued?.password}
          </Typography>
          <Tooltip title={t('users.copy')}>
            <IconButton aria-label={t('users.copy')} onClick={copy}>
              <ContentCopyIcon />
            </IconButton>
          </Tooltip>
        </Box>
        {copied && (
          <Alert severity="success" sx={{ mt: 2 }}>
            {t('users.copied')}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={close}>
          {t('users.done')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
