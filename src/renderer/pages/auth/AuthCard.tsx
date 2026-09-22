import { Box, Paper, Stack, Typography } from '@mui/material';
import type { FC, FormEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  title: string;
  subtitle?: string;
  onSubmit: () => void;
  children: ReactNode;
}

export const AuthCard: FC<Props> = ({ title, subtitle, onSubmit, children }) => {
  const { t } = useTranslation();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        bgcolor: 'background.default'
      }}
    >
      <Paper elevation={3} sx={{ width: '100%', maxWidth: 420, p: { xs: 3, sm: 4 } }}>
        <Box component="form" noValidate onSubmit={handleSubmit}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="overline" color="primary">
                {t('app.title')}
              </Typography>
              <Typography variant="h5" component="h1">
                {title}
              </Typography>
              {subtitle && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {subtitle}
                </Typography>
              )}
            </Box>
            {children}
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
};
