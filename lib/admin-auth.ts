export const ADMIN_SESSION_COOKIE = 'admin_session';

const textEncoder = new TextEncoder();

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return toHex(new Uint8Array(digest));
};

export const getAdminAuthConfig = () => {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    return null;
  }

  return {
    username,
    password,
    sessionSecret: process.env.ADMIN_SESSION_SECRET ?? `${username}:${password}`
  };
};

export const isAdminAuthConfigured = () => getAdminAuthConfig() !== null;

export const isValidAdminCredentials = (username: string, password: string) => {
  const config = getAdminAuthConfig();
  if (!config) {
    return false;
  }
  return username === config.username && password === config.password;
};

export const createAdminSessionValue = async () => {
  const config = getAdminAuthConfig();
  if (!config) {
    return null;
  }
  return sha256(`${config.username}:${config.password}:${config.sessionSecret}`);
};

export const isAuthorizedAdminSession = async (sessionValue: string | undefined) => {
  if (!sessionValue) {
    return false;
  }

  const expected = await createAdminSessionValue();
  if (!expected) {
    return false;
  }

  return sessionValue === expected;
};

export const sanitizeNextPath = (value: string | null | undefined) => {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/admin';
  }

  if (value.startsWith('/login')) {
    return '/admin';
  }

  return value;
};
