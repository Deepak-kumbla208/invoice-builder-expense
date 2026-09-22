import type { ReactNode } from 'react';
import type { RouteObject } from 'react-router-dom';
import { AuditLogPage } from '../pages/auditLog';
import { ChangePasswordPage } from '../pages/auth/ChangePassword';
import { LoginPage } from '../pages/auth/Login';
import { BanksPage } from '../pages/banks';
import { BusinessesPage } from '../pages/businesses';
import { CategoriesPage } from '../pages/categories';
import { ClientsPage } from '../pages/clients';
import { CurrenciesPage } from '../pages/currencies';
import { DashboardPage } from '../pages/dashboard';
import { InvoicesPage } from '../pages/invoices';
import { ItemsPage } from '../pages/items';
import { LayoutsPage } from '../pages/layouts';
import { NoAccess } from '../pages/noAccess/NoAccess';
import { OfficesPage } from '../pages/offices';
import { PresetsPage } from '../pages/presets';
import { QuotesPage } from '../pages/quotes';
import { ReportsPage } from '../pages/reports';
import { RolesPage } from '../pages/roles';
import { SettingsPage } from '../pages/settings';
import { StyleProfilesPage } from '../pages/styleProfiles';
import { UnitsPage } from '../pages/units';
import { UsersPage } from '../pages/users';
import { ThemeProviderWrapper } from '../shared/components/layout/theme/ThemeProviderWrapper';
import { InvoiceType } from '../shared/enums/invoiceType';
import { App } from './App';
import { AuthRoot } from './auth/AuthRoot';
import { RequireAuth } from './auth/RequireAuth';
import { RequirePermission } from './auth/RequirePermission';
import { navRuleFor } from './navConfig';

export const GUARDED_PAGES: Record<string, ReactNode> = {
  '/invoices': <InvoicesPage type={InvoiceType.invoice} />,
  '/quotes': <QuotesPage />,
  '/reports': <ReportsPage />,
  '/clients': <ClientsPage />,
  '/users': <UsersPage />,
  '/roles': <RolesPage />,
  '/companies': <BusinessesPage />,
  '/offices': <OfficesPage />,
  '/items': <ItemsPage />,
  '/banks': <BanksPage />,
  '/currencies': <CurrenciesPage />,
  '/units': <UnitsPage />,
  '/categories': <CategoriesPage />,
  '/layouts': <LayoutsPage />,
  '/styleProfiles': <StyleProfilesPage />,
  '/presets': <PresetsPage />,
  '/audit-log': <AuditLogPage />,
  '/settings': <SettingsPage />
};

export const createAppRoutes = (): RouteObject[] => [
  {
    element: (
      <ThemeProviderWrapper>
        <AuthRoot />
      </ThemeProviderWrapper>
    ),
    children: [
      { path: '/login', element: <LoginPage /> },
      {
        path: '/change-password',
        element: (
          <RequireAuth allowPasswordChange>
            <ChangePasswordPage />
          </RequireAuth>
        )
      },
      {
        path: '/',
        element: (
          <RequireAuth>
            <App />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <DashboardPage /> },
          ...Object.entries(GUARDED_PAGES).map(([path, page]) => ({
            path: path.slice(1),
            element: <RequirePermission rule={navRuleFor(path)}>{page}</RequirePermission>
          })),
          { path: '*', element: <NoAccess /> }
        ]
      }
    ]
  }
];
