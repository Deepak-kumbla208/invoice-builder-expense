import { configureStore } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { Provider } from 'react-redux';
import { Outlet, RouterProvider, createMemoryRouter } from 'react-router-dom';
import { RequireAuth } from '../app/auth/RequireAuth';
import { RequirePermission } from '../app/auth/RequirePermission';
import { navRuleFor } from '../app/navConfig';
import i18n from '../i18n';
import { ChangePasswordPage } from '../pages/auth/ChangePassword';
import { LoginPage } from '../pages/auth/Login';
import { PermissionGrid } from '../shared/components/permissions/PermissionGrid';
import type { AuthProfile } from '../shared/types/auth';
import { authSlice, clearAuth, setProfile, signedOut } from '../state/authSlice';
import { pageSlice } from '../state/pageSlice';

const api = vi.hoisted(() => ({ login: vi.fn(), logout: vi.fn(), changePassword: vi.fn() }));
vi.mock('../shared/api/restApi', () => ({ getApi: () => api }));

const profile = (permissions: string[], mustChangePassword = false): AuthProfile => ({
  user: {
    id: 5,
    email: 'meera@example.test',
    fullName: 'Meera Rao',
    roleId: 2,
    roleName: 'Office Admin',
    allOffices: false,
    mustChangePassword
  },
  permissions,
  offices: [],
  companies: [],
  csrfToken: 'csrf'
});

const setup = (path: string, initial?: AuthProfile) => {
  const store = configureStore({
    reducer: { [pageSlice.name]: pageSlice.reducer, [authSlice.name]: authSlice.reducer }
  });
  store.dispatch(initial ? setProfile(initial) : clearAuth());
  const router = createMemoryRouter(
    [
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
            <Outlet />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <p>Dashboard page</p> },
          {
            path: 'users',
            element: (
              <RequirePermission rule={navRuleFor('/users')}>
                <p>Users page</p>
              </RequirePermission>
            )
          }
        ]
      }
    ],
    { initialEntries: [path] }
  );
  render(
    <Provider store={store}>
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>
    </Provider>
  );
  return { router, store };
};

describe('auth shell', () => {
  beforeEach(() => {
    api.login.mockReset();
    api.logout.mockReset();
    api.changePassword.mockReset();
  });

  it('sends an anonymous visitor to sign in, keeping where they were going', async () => {
    const { router } = setup('/users');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('Forgot password? Contact your office admin.')).toBeInTheDocument();
    expect(`${router.state.location.pathname}${router.state.location.search}`).toBe('/login?returnTo=%2Fusers');
  });

  it('does not carry the page over to the next sign-in after signing out', async () => {
    const { router, store } = setup('/users', profile(['admin.users']));
    expect(await screen.findByText('Users page')).toBeInTheDocument();
    act(() => {
      store.dispatch(signedOut());
    });
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(`${router.state.location.pathname}${router.state.location.search}`).toBe('/login');
  });

  it('shows the server message when sign-in fails', async () => {
    api.login.mockResolvedValue({ success: false, key: 'auth.invalidCredentials' });
    setup('/login');
    await userEvent.type(screen.getByLabelText('Email'), 'meera@example.test');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The email or password is incorrect.');
    expect(api.login).toHaveBeenCalledWith({ email: 'meera@example.test', password: 'wrong password' });
  });

  it('returns to the requested page after signing in', async () => {
    api.login.mockResolvedValue({ success: true, data: profile(['admin.users']) });
    const { router } = setup('/login?returnTo=%2Fusers');
    await userEvent.type(screen.getByLabelText('Email'), 'meera@example.test');
    await userEvent.type(screen.getByLabelText('Password'), 'right password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Users page')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/users');
  });

  it('never redirects off-site after signing in', async () => {
    api.login.mockResolvedValue({ success: true, data: profile([]) });
    const { router } = setup('/login?returnTo=%2F%2Fevil.example');
    await userEvent.type(screen.getByLabelText('Email'), 'meera@example.test');
    await userEvent.type(screen.getByLabelText('Password'), 'right password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('shows the no-access page for a route the user lacks permission for', async () => {
    setup('/users', profile(['invoice.view']));
    expect(await screen.findByText("You don't have access to this page.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to dashboard' })).toBeInTheDocument();
    expect(screen.queryByText('Users page')).not.toBeInTheDocument();
  });

  it('forces a password change before anything else, then continues', async () => {
    api.changePassword.mockResolvedValue({ success: true });
    const { router, store } = setup('/users', profile(['admin.users'], true));
    expect(await screen.findByText(/Your password was set by an administrator/)).toBeInTheDocument();
    expect(router.state.location.search).toBe('?returnTo=%2Fusers');

    await userEvent.type(screen.getByLabelText('Current password'), 'Temp-password-1');
    await userEvent.type(screen.getByLabelText('New password'), 'short');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(api.changePassword).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText('New password'));
    await userEvent.clear(screen.getByLabelText('Confirm new password'));
    await userEvent.type(screen.getByLabelText('New password'), 'A much longer password');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'A much longer password');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Users page')).toBeInTheDocument();
    expect(api.changePassword).toHaveBeenCalledWith({
      currentPassword: 'Temp-password-1',
      newPassword: 'A much longer password'
    });
    expect(store.getState().authSlice.user?.mustChangePassword).toBe(false);
  });
});

describe('PermissionGrid', () => {
  const groups = [
    {
      group: 'Invoices',
      permissions: [
        { key: 'invoice.view', label: 'View own invoices', requires: [] },
        { key: 'invoice.edit', label: 'Edit invoices', requires: ['invoice.view', 'customer.view'] }
      ]
    },
    {
      group: 'Customers',
      permissions: [{ key: 'customer.view', label: 'View customers', requires: [] }]
    },
    {
      group: 'Administration',
      permissions: [{ key: 'admin.users', label: 'Manage users', requires: [] }]
    }
  ];

  const renderGrid = (props: Partial<Parameters<typeof PermissionGrid>[0]> = {}) => {
    const onChange = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <PermissionGrid groups={groups} selected={new Set()} onChange={onChange} {...props} />
      </I18nextProvider>
    );
    return onChange;
  };

  it('shows labels, not keys, and ticks what a permission needs', async () => {
    const onChange = renderGrid();
    expect(screen.getByText('Needs: View own invoices, View customers')).toBeInTheDocument();
    expect(screen.queryByText('invoice.edit')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /^Edit invoices/ }));
    expect([...onChange.mock.calls[0][0]].sort()).toEqual(['customer.view', 'invoice.edit', 'invoice.view']);
  });

  it('shows role permissions as ticked, greyed and labelled "from role"', () => {
    renderGrid({ selected: new Set(['invoice.view']), locked: new Set(['invoice.view']) });
    const fromRole = screen.getByRole('checkbox', { name: /^View own invoices/ });
    expect(fromRole).toBeChecked();
    expect(fromRole).toBeDisabled();
    expect(screen.getByText('from role')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^Manage users/ })).toBeEnabled();
  });

  it('greys out permissions the editor cannot grant', () => {
    renderGrid({ grantable: new Set(['invoice.view', 'invoice.edit']) });
    expect(screen.getByRole('checkbox', { name: /^Edit invoices/ })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /^Manage users/ })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /^View own invoices/ })).toBeEnabled();
  });
});
