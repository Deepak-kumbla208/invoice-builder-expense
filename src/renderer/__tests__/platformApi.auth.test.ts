import { setAuthHandlers, setCsrfToken, webApi } from '../shared/api/platformApi';

const profile = {
  user: {
    id: 1,
    email: 'a@example.test',
    fullName: 'A',
    roleId: 1,
    roleName: 'Super Admin',
    allOffices: true,
    mustChangePassword: false
  },
  permissions: ['admin.users'],
  offices: [],
  companies: [],
  csrfToken: 'csrf-123'
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const fetchMock = vi.fn<typeof fetch>();
const headersOf = (call: number) => (fetchMock.mock.calls[call][1]?.headers ?? {}) as Record<string, string>;

describe('platform API auth handling', () => {
  const onUnauthorized = vi.fn();
  const onMustChangePassword = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    onUnauthorized.mockReset();
    onMustChangePassword.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    setCsrfToken(undefined);
    setAuthHandlers({ onUnauthorized, onMustChangePassword });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setAuthHandlers({});
  });

  it('sends cookies on every request and the CSRF token from login on writes only', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { success: true, data: profile }));
    await webApi().login({ email: 'a@example.test', password: 'secret' });
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe('include');
    expect(headersOf(0)['X-CSRF-Token']).toBeUndefined();

    fetchMock.mockResolvedValueOnce(json(200, { success: true, data: [] }));
    await webApi().getUsers();
    expect(fetchMock.mock.calls[1][1]?.credentials).toBe('include');
    expect(headersOf(1)['X-CSRF-Token']).toBeUndefined();

    fetchMock.mockResolvedValueOnce(json(200, { success: true, data: { temporaryPassword: 'x' } }));
    await webApi().resetUserPassword(7);
    expect(fetchMock.mock.calls[2][0]).toContain('/api/users/7/reset-password');
    expect(headersOf(2)['X-CSRF-Token']).toBe('csrf-123');
  });

  it('forgets the CSRF token after logout', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { success: true, data: profile }));
    await webApi().getProfile();
    fetchMock.mockResolvedValueOnce(json(200, { success: true }));
    await webApi().logout();
    expect(headersOf(1)['X-CSRF-Token']).toBe('csrf-123');

    fetchMock.mockResolvedValueOnce(json(200, { success: true, data: [] }));
    await webApi().deleteRole(3);
    expect(headersOf(2)['X-CSRF-Token']).toBeUndefined();
  });

  it('reports a 401 from a normal call as an ended session', async () => {
    setCsrfToken('csrf-123');
    fetchMock.mockResolvedValueOnce(json(401, { success: false, key: 'auth.unauthenticated' }));
    const response = await webApi().getUsers();
    expect(response.success).toBe(false);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(json(200, { success: true }));
    await webApi().deleteRole(3);
    expect(headersOf(1)['X-CSRF-Token']).toBeUndefined();
  });

  it('does not treat a failed login or an anonymous /me as an ended session', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { success: false, key: 'auth.invalidCredentials' }));
    const login = await webApi().login({ email: 'a@example.test', password: 'wrong' });
    expect(login.key).toBe('auth.invalidCredentials');

    fetchMock.mockResolvedValueOnce(json(401, { success: false, key: 'auth.unauthenticated' }));
    await webApi().getProfile();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('reports the must-change-password gate', async () => {
    fetchMock.mockResolvedValueOnce(json(403, { success: false, key: 'auth.mustChangePassword' }));
    await webApi().getRoles();
    expect(onMustChangePassword).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(json(403, { success: false, key: 'auth.forbidden' }));
    await webApi().getRoles();
    expect(onMustChangePassword).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('turns error responses into translatable messages', async () => {
    fetchMock.mockResolvedValueOnce(json(404, { success: false, key: 'error.notFound', message: 'Not found' }));
    expect((await webApi().getUsers()).message).toBe('error.notFound');

    fetchMock.mockResolvedValueOnce(
      json(400, {
        success: false,
        key: 'error.validation',
        message: 'error.validation',
        errors: { gstin: ['office.gstinInvalid'] }
      })
    );
    expect((await webApi().getOffices()).message).toBe('office.gstinInvalid');

    fetchMock.mockResolvedValueOnce(
      json(403, { success: false, key: 'role.cannotGrant', errors: { permissions: ['admin.users'] } })
    );
    expect((await webApi().getRoles()).message).toBe('role.cannotGrant');
  });
});
