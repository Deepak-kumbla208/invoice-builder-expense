import { ChevronLeft, ChevronRight, ExpandLess, ExpandMore } from '@mui/icons-material';
import KeyIcon from '@mui/icons-material/Key';
import LogoutIcon from '@mui/icons-material/Logout';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import {
  Avatar,
  Box,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { getApi } from '../shared/api/restApi';
import { useLogout } from '../shared/hooks/auth/useAuthActions';
import { withReturnTo } from '../shared/utils/authFunctions';
import { useAppDispatch, useAppSelector } from '../state/configureStore';
import { selectAuthUser, selectPermissionSet } from '../state/authSlice';
import { selectSettings, selectVersion, setVersion } from '../state/pageSlice';
import { NAV_CONFIG, filterNav, isNavGroup, navLeaves, type NavEntry, type NavLeaf } from './navConfig';

const DRAWER_WIDTH = 260;
const COLLAPSED_WIDTH = 60;

const isActivePath = (path: string, pathname: string) =>
  path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);

const containsPath = (entry: NavEntry, pathname: string) =>
  navLeaves([entry]).some(leaf => isActivePath(leaf.path, pathname));

export const Sidebar: FC = () => {
  const dispatch = useAppDispatch();
  const theme = useTheme();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useLogout();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [open, setOpen] = useState(true);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ invoices: true });
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const settings = useAppSelector(selectSettings);
  const granted = useAppSelector(selectPermissionSet);
  const user = useAppSelector(selectAuthUser);
  const version = useAppSelector(selectVersion);

  const entries = useMemo(() => filterNav(NAV_CONFIG, granted, settings), [granted, settings]);

  const isGroupOpen = useCallback(
    (entry: NavEntry) => openGroups[entry.id] ?? containsPath(entry, location.pathname),
    [openGroups, location.pathname]
  );

  const toggleGroup = (entry: NavEntry) => setOpenGroups(prev => ({ ...prev, [entry.id]: !isGroupOpen(entry) }));

  const renderLeaf = (leaf: NavLeaf, depth: number, labelKey = leaf.labelKey, Icon = leaf.icon) => {
    const label = t(labelKey);
    const button = (
      <ListItemButton
        key={leaf.id}
        selected={isActivePath(leaf.path, location.pathname)}
        onClick={() => navigate(leaf.path)}
        sx={{ minHeight: 44, pl: open ? 2 + depth * 2 : 2.5 }}
      >
        <ListItemIcon sx={{ color: 'text.primary', minWidth: open ? 40 : 0 }}>
          <Icon fontSize="small" />
        </ListItemIcon>
        {open && <ListItemText primary={label} />}
      </ListItemButton>
    );
    return open ? (
      button
    ) : (
      <Tooltip key={leaf.id} title={label} placement="right">
        {button}
      </Tooltip>
    );
  };

  const renderEntry = (entry: NavEntry, depth = 0) => {
    if (!isNavGroup(entry)) return renderLeaf(entry, depth);

    const [onlyChild] = entry.children;
    if (entry.children.length === 1 && !isNavGroup(onlyChild)) {
      return renderLeaf(onlyChild, depth, entry.labelKey, entry.icon);
    }

    const expanded = isGroupOpen(entry);
    const label = t(entry.labelKey);
    const button = (
      <ListItemButton onClick={() => toggleGroup(entry)} sx={{ minHeight: 44, pl: open ? 2 + depth * 2 : 2.5 }}>
        <ListItemIcon sx={{ color: 'text.primary', minWidth: open ? 40 : 0 }}>
          <entry.icon fontSize="small" />
        </ListItemIcon>
        {open && <ListItemText primary={label} />}
        {open && (expanded ? <ExpandLess /> : <ExpandMore />)}
      </ListItemButton>
    );

    return (
      <Box key={entry.id}>
        {open ? (
          button
        ) : (
          <Tooltip title={label} placement="right">
            {button}
          </Tooltip>
        )}
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {entry.children.map(child => renderEntry(child, depth + 1))}
          </List>
          {!open && <Divider sx={{ my: 0.5 }} />}
        </Collapse>
      </Box>
    );
  };

  const onChangePassword = () => {
    setMenuAnchor(null);
    navigate(withReturnTo('/change-password', `${location.pathname}${location.search}`));
  };

  const onLogout = () => {
    setMenuAnchor(null);
    logout();
  };

  useEffect(() => {
    if (!isDesktop) setOpen(false);
  }, [isDesktop]);

  useEffect(() => {
    getApi()
      .getAppVersion()
      .then(v => dispatch(setVersion(v)));
  }, [dispatch]);

  const initials = (user?.fullName ?? '?')
    .split(/\s+/)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: open ? DRAWER_WIDTH : COLLAPSED_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: open ? DRAWER_WIDTH : COLLAPSED_WIDTH,
          boxSizing: 'border-box',
          backgroundColor: theme.palette.background.paper,
          color: theme.palette.text.primary,
          borderRight: `1px solid ${theme.palette.divider}`,
          overflowX: 'hidden',
          transition: 'width 0.3s',
          borderRadius: 0,
          display: 'flex',
          flexDirection: 'column'
        }
      }}
    >
      {isDesktop && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: open ? 'space-between' : 'center',
            px: 1,
            minHeight: 64
          }}
        >
          {open && (
            <Typography variant="h6" noWrap component="div" sx={{ pl: 1, color: theme.palette.primary.main }}>
              {t('app.title')}
            </Typography>
          )}
          <Tooltip title={t('ariaLabel.menu')}>
            <IconButton onClick={() => setOpen(!open)} aria-label={t('ariaLabel.menu')}>
              {open ? <ChevronLeft /> : <ChevronRight />}
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {isDesktop && <Divider />}

      <List component="nav" aria-label={t('ariaLabel.menu')} sx={{ flexGrow: 1, overflowY: 'auto' }}>
        {entries.map(entry => renderEntry(entry))}
      </List>

      <Divider />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, justifyContent: open ? 'flex-start' : 'center' }}>
        {open && (
          <>
            <Avatar sx={{ width: 32, height: 32, fontSize: 14, bgcolor: 'primary.main' }}>{initials}</Avatar>
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography variant="body2" noWrap>
                {user?.fullName}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap component="div">
                {user?.roleName}
              </Typography>
            </Box>
          </>
        )}
        <Tooltip title={t('auth.accountMenu')}>
          <IconButton
            aria-label={t('auth.accountMenu')}
            aria-haspopup="menu"
            onClick={event => setMenuAnchor(event.currentTarget)}
          >
            {open ? <MoreVertIcon /> : <Avatar sx={{ width: 28, height: 28, fontSize: 12 }}>{initials}</Avatar>}
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <MenuItem disabled>
            <ListItemText primary={user?.fullName} secondary={user?.email} />
          </MenuItem>
          <Divider />
          <MenuItem onClick={onChangePassword}>
            <ListItemIcon>
              <KeyIcon fontSize="small" />
            </ListItemIcon>
            {t('auth.changePassword')}
          </MenuItem>
          <MenuItem onClick={onLogout}>
            <ListItemIcon>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            {t('auth.signOut')}
          </MenuItem>
        </Menu>
      </Box>
      {open && (
        <Typography variant="caption" color="text.secondary" sx={{ pb: 1, textAlign: 'center', whiteSpace: 'nowrap' }}>
          {t('app.version')}: {version}
        </Typography>
      )}
    </Drawer>
  );
};
