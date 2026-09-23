import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { createApp, type AppOptions } from '../../webserver/app';
import { createServerDeps } from '../../webserver/deps';
import type { PgTestDb } from './pgTestDb';

export const TEST_ORIGIN = 'https://app.test';

export type Session = { cookie: string; csrfToken: string };

export type ApiResponse = {
  status: number;
  body: { success?: boolean; key?: string; data?: unknown; errors?: Record<string, string[]> } & Record<
    string,
    unknown
  >;
  setCookie: string[];
};

type RequestOptions = { body?: unknown; session?: Session; csrf?: string | null; origin?: string | null };

export type TestServer = {
  request: (method: string, path: string, options?: RequestOptions) => Promise<ApiResponse>;
  login: (email: string, password: string, previous?: Session) => Promise<Session & { response: ApiResponse }>;
  close: () => Promise<void>;
};

export const sessionCookieOf = (setCookie: string[]) =>
  setCookie.find(cookie => cookie.startsWith('__Host-sid='))?.split(';')[0];

export const startTestServer = async (testDb: PgTestDb, options: AppOptions = {}): Promise<TestServer> => {
  const app = createApp(createServerDeps(testDb.rolePool('app_user')), { appOrigin: TEST_ORIGIN, ...options });
  const server = await new Promise<Server>(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const request: TestServer['request'] = async (method, path, { body, session, csrf, origin } = {}) => {
    const csrfToken = csrf === undefined ? session?.csrfToken : csrf;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (session) headers.cookie = session.cookie;
    if (csrfToken) headers['x-csrf-token'] = csrfToken;
    if (origin) headers.origin = origin;

    const res = await fetch(baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : {}, setCookie: res.headers.getSetCookie() };
  };

  const login: TestServer['login'] = async (email, password, previous) => {
    const response = await request('POST', '/api/auth/login', {
      body: { email, password },
      origin: TEST_ORIGIN,
      session: previous,
      csrf: null
    });
    const cookie = sessionCookieOf(response.setCookie) ?? '';
    const csrfToken = (response.body.data as { csrfToken?: string } | undefined)?.csrfToken ?? '';
    return { cookie, csrfToken, response };
  };

  const close = () =>
    new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });

  return { request, login, close };
};
