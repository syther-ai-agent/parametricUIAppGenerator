import { afterEach, describe, expect, it } from 'vitest';
import {
  createAdminSessionValue,
  isAdminAuthConfigured,
  isAuthorizedAdminSession,
  isValidAdminCredentials,
  sanitizeNextPath
} from '../lib/admin-auth';

const originalUsername = process.env.ADMIN_USERNAME;
const originalPassword = process.env.ADMIN_PASSWORD;
const originalSessionSecret = process.env.ADMIN_SESSION_SECRET;

const setAuthEnv = (username?: string, password?: string) => {
  if (username === undefined) {
    delete process.env.ADMIN_USERNAME;
  } else {
    process.env.ADMIN_USERNAME = username;
  }

  if (password === undefined) {
    delete process.env.ADMIN_PASSWORD;
  } else {
    process.env.ADMIN_PASSWORD = password;
  }

  process.env.ADMIN_SESSION_SECRET = 'test-session-secret';
};

afterEach(() => {
  setAuthEnv(originalUsername, originalPassword);
  if (originalSessionSecret === undefined) {
    delete process.env.ADMIN_SESSION_SECRET;
  } else {
    process.env.ADMIN_SESSION_SECRET = originalSessionSecret;
  }
});

describe('admin auth', () => {
  it('reports when admin auth is configured', () => {
    setAuthEnv('admin', 'secret');
    expect(isAdminAuthConfigured()).toBe(true);
  });

  it('rejects requests when credentials are missing', () => {
    setAuthEnv();
    expect(isAdminAuthConfigured()).toBe(false);
    expect(isValidAdminCredentials('admin', 'secret')).toBe(false);
  });

  it('accepts valid admin credentials', () => {
    setAuthEnv('admin', 'secret');
    expect(isValidAdminCredentials('admin', 'secret')).toBe(true);
  });

  it('rejects invalid admin credentials', () => {
    setAuthEnv('admin', 'secret');
    expect(isValidAdminCredentials('admin', 'wrong')).toBe(false);
  });

  it('creates and validates an admin session value', async () => {
    setAuthEnv('admin', 'secret');
    const session = await createAdminSessionValue();
    expect(session).not.toBeNull();
    expect(await isAuthorizedAdminSession(session ?? undefined)).toBe(true);
  });

  it('sanitizes invalid next paths', () => {
    expect(sanitizeNextPath(undefined)).toBe('/admin');
    expect(sanitizeNextPath('https://example.com')).toBe('/admin');
    expect(sanitizeNextPath('//evil.com')).toBe('/admin');
    expect(sanitizeNextPath('/login')).toBe('/admin');
    expect(sanitizeNextPath('/admin')).toBe('/admin');
  });
});
