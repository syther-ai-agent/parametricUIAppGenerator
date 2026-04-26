import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionValue,
  isAdminAuthConfigured,
  isValidAdminCredentials,
  sanitizeNextPath
} from '../../../../lib/admin-auth';

const buildCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 7
});

const isJsonRequest = (request: Request) => request.headers.get('content-type')?.includes('application/json');

const getRequestPayload = async (request: Request) => {
  if (isJsonRequest(request)) {
    const payload = (await request.json()) as { username?: string; password?: string; next?: string };
    return {
      username: payload.username ?? '',
      password: payload.password ?? '',
      next: payload.next
    };
  }

  const formData = await request.formData();
  return {
    username: String(formData.get('username') ?? ''),
    password: String(formData.get('password') ?? ''),
    next: String(formData.get('next') ?? '')
  };
};

const invalidLoginResponse = (request: Request, next: string) => {
  if (isJsonRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid username or password.' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('error', 'invalid');
  loginUrl.searchParams.set('next', next);
  return NextResponse.redirect(loginUrl, { status: 303 });
};

export async function POST(request: Request) {
  if (!isAdminAuthConfigured()) {
    return NextResponse.json({ ok: false, error: 'Admin authentication is not configured.' }, { status: 503 });
  }

  const { username, password, next } = await getRequestPayload(request);
  const target = sanitizeNextPath(next);

  if (!isValidAdminCredentials(username, password)) {
    return invalidLoginResponse(request, target);
  }

  const sessionValue = await createAdminSessionValue();
  if (!sessionValue) {
    return NextResponse.json({ ok: false, error: 'Admin authentication is not configured.' }, { status: 503 });
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, sessionValue, buildCookieOptions());

  if (isJsonRequest(request)) {
    return NextResponse.json({ ok: true, redirectTo: target });
  }

  return NextResponse.redirect(new URL(target, request.url), { status: 303 });
}
