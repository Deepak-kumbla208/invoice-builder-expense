import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import AssessmentIcon from '@mui/icons-material/Assessment';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import BusinessIcon from '@mui/icons-material/Business';
import CategoryIcon from '@mui/icons-material/Category';
import ColorLensIcon from '@mui/icons-material/ColorLens';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DashboardIcon from '@mui/icons-material/Dashboard';
import DescriptionIcon from '@mui/icons-material/Description';
import HistoryIcon from '@mui/icons-material/History';
import InventoryIcon from '@mui/icons-material/Inventory';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptIcon from '@mui/icons-material/Receipt';
import ScaleIcon from '@mui/icons-material/Scale';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsIcon from '@mui/icons-material/Settings';
import StoreIcon from '@mui/icons-material/Store';
import TuneIcon from '@mui/icons-material/Tune';
import type { SvgIconComponent } from '@mui/icons-material';
import type { Settings } from '../shared/types/settings';
import { hasPermission, type PermissionRule } from '../shared/utils/permissionFunctions';

export type NavFeature = 'quotesON' | 'reportsON' | 'presetsON' | 'styleProfilesON';

interface NavBase {
  id: string;
  labelKey: string;
  icon: SvgIconComponent;
}

export interface NavLeaf extends NavBase {
  path: string;
  permission?: PermissionRule;
  feature?: NavFeature;
}

export interface NavGroup extends NavBase {
  children: NavEntry[];
}

export type NavEntry = NavLeaf | NavGroup;

export const isNavGroup = (entry: NavEntry): entry is NavGroup => 'children' in entry;

const invoiceSetup: PermissionRule = { all: ['admin.invoice_setup'] };

export const NAV_CONFIG: NavEntry[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: DashboardIcon, path: '/' },
  {
    id: 'invoices',
    labelKey: 'nav.invoices',
    icon: DescriptionIcon,
    children: [
      {
        id: 'allInvoices',
        labelKey: 'nav.allInvoices',
        icon: DescriptionIcon,
        path: '/invoices',
        permission: { all: ['invoice.view'] }
      },
      {
        id: 'quotes',
        labelKey: 'nav.quotes',
        icon: ReceiptIcon,
        path: '/quotes',
        permission: { all: ['invoice.view'] },
        feature: 'quotesON'
      }
    ]
  },
  {
    id: 'reports',
    labelKey: 'nav.reports',
    icon: AssessmentIcon,
    path: '/reports',
    permission: { all: ['report.view', 'invoice.view'] },
    feature: 'reportsON'
  },
  {
    id: 'customers',
    labelKey: 'nav.customers',
    icon: PeopleIcon,
    path: '/clients',
    permission: { all: ['customer.view'] }
  },
  {
    id: 'administration',
    labelKey: 'nav.administration',
    icon: AdminPanelSettingsIcon,
    children: [
      {
        id: 'users',
        labelKey: 'nav.users',
        icon: ManageAccountsIcon,
        path: '/users',
        permission: { all: ['admin.users'] }
      },
      {
        id: 'roles',
        labelKey: 'nav.roles',
        icon: SecurityIcon,
        path: '/roles',
        permission: { all: ['admin.roles'] }
      },
      {
        id: 'companies',
        labelKey: 'nav.companies',
        icon: BusinessIcon,
        path: '/companies',
        permission: { all: ['admin.companies'] }
      },
      {
        id: 'offices',
        labelKey: 'nav.offices',
        icon: StoreIcon,
        path: '/offices',
        permission: { all: ['admin.offices'] }
      },
      {
        id: 'invoiceSetup',
        labelKey: 'nav.invoiceSetup',
        icon: TuneIcon,
        children: [
          { id: 'items', labelKey: 'nav.items', icon: InventoryIcon, path: '/items', permission: invoiceSetup },
          { id: 'banks', labelKey: 'nav.banks', icon: AccountBalanceIcon, path: '/banks', permission: invoiceSetup },
          {
            id: 'currencies',
            labelKey: 'nav.currencies',
            icon: AttachMoneyIcon,
            path: '/currencies',
            permission: invoiceSetup
          },
          { id: 'units', labelKey: 'nav.units', icon: ScaleIcon, path: '/units', permission: invoiceSetup },
          {
            id: 'categories',
            labelKey: 'nav.categories',
            icon: CategoryIcon,
            path: '/categories',
            permission: invoiceSetup
          },
          { id: 'layouts', labelKey: 'nav.layouts', icon: AccountTreeIcon, path: '/layouts', permission: invoiceSetup },
          {
            id: 'styleProfiles',
            labelKey: 'nav.styleProfiles',
            icon: ColorLensIcon,
            path: '/styleProfiles',
            permission: invoiceSetup,
            feature: 'styleProfilesON'
          },
          {
            id: 'presets',
            labelKey: 'nav.presets',
            icon: ContentCopyIcon,
            path: '/presets',
            permission: invoiceSetup,
            feature: 'presetsON'
          }
        ]
      },
      {
        id: 'auditLog',
        labelKey: 'nav.auditLog',
        icon: HistoryIcon,
        path: '/audit-log',
        permission: { all: ['audit.view'] }
      },
      {
        id: 'settings',
        labelKey: 'nav.settings',
        icon: SettingsIcon,
        path: '/settings',
        permission: { all: ['admin.settings'] }
      }
    ]
  }
];

export const navLeaves = (entries: NavEntry[] = NAV_CONFIG): NavLeaf[] =>
  entries.flatMap(entry => (isNavGroup(entry) ? navLeaves(entry.children) : [entry]));

export const navRuleFor = (path: string): PermissionRule | undefined =>
  navLeaves().find(leaf => leaf.path === path)?.permission;

export const filterNav = (
  entries: NavEntry[],
  granted: ReadonlySet<string>,
  settings?: Pick<Settings, NavFeature>
): NavEntry[] =>
  entries.flatMap((entry): NavEntry[] => {
    if (isNavGroup(entry)) {
      const children = filterNav(entry.children, granted, settings);
      return children.length ? [{ ...entry, children }] : [];
    }
    if (entry.feature && !settings?.[entry.feature]) return [];
    return hasPermission(granted, entry.permission) ? [entry] : [];
  });
