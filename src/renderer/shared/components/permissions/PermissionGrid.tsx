import { Box, Checkbox, Chip, FormControlLabel, FormGroup, Paper, Stack, Typography } from '@mui/material';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import type { PermissionGroup } from '../../types/admin';
import { missingToGrant, tickPermission, untickPermission } from '../../utils/permissionFunctions';

interface Props {
  groups: PermissionGroup[];
  selected: ReadonlySet<string>;
  locked?: ReadonlySet<string>;
  grantable?: ReadonlySet<string>;
  disabled?: boolean;
  onChange: (next: Set<string>) => void;
}

export const PermissionGrid: FC<Props> = ({ groups, selected, locked, grantable, disabled = false, onChange }) => {
  const { t } = useTranslation();

  const labels = useMemo(
    () => new Map(groups.flatMap(group => group.permissions.map(permission => [permission.key, permission.label]))),
    [groups]
  );

  const available = useMemo(
    () => (grantable ? new Set([...grantable, ...selected, ...(locked ?? [])]) : undefined),
    [grantable, selected, locked]
  );

  const toggle = (key: string, checked: boolean) => {
    onChange(checked ? tickPermission(selected, key) : untickPermission(selected, key, locked));
  };

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }
      }}
    >
      {groups.map(group => (
        <Paper key={group.group} variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" component="h3" gutterBottom>
            {group.group}
          </Typography>
          <FormGroup>
            {group.permissions.map(permission => {
              const fromRole = locked?.has(permission.key) ?? false;
              const checked = fromRole || selected.has(permission.key);
              const missing = available && !checked ? missingToGrant(permission.key, available) : [];
              const requires = permission.requires.map(key => labels.get(key) ?? key);
              const hint = missing.length
                ? t('roles.notGrantable')
                : requires.length
                  ? t('roles.requires', { permissions: requires.join(', ') })
                  : undefined;

              return (
                <FormControlLabel
                  key={permission.key}
                  sx={{ alignItems: 'flex-start', mr: 0, py: 0.25 }}
                  control={
                    <Checkbox
                      size="small"
                      sx={{ pt: 0.5 }}
                      checked={checked}
                      disabled={disabled || fromRole || missing.length > 0}
                      onChange={event => toggle(permission.key, event.target.checked)}
                    />
                  }
                  label={
                    <Stack sx={{ pt: 0.5 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Typography variant="body2">{permission.label}</Typography>
                        {fromRole && <Chip size="small" label={t('roles.fromRole')} />}
                      </Stack>
                      {hint && (
                        <Typography variant="caption" color="text.secondary">
                          {hint}
                        </Typography>
                      )}
                    </Stack>
                  }
                />
              );
            })}
          </FormGroup>
        </Paper>
      ))}
    </Box>
  );
};
