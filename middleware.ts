import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_SESSION_COOKIE, isAdminAuthConfigured, isAuthorizedAdminSession } from './lib/admin-auth';

const pathnameIsApi = (pathname: string) => pathname.startsWith('/api/');

const isProtectedRequest = (request: NextRequest) => {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/admin')) {
    return true;
  }
  return pathname === '/api/projects' && request.method === 'POST';
};

const redirectToLogin = (request: NextRequest, reason?: 'config' | 'expired') => {
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  if (reason) {
    loginUrl.searchParams.set('error', reason);
  }
  return NextResponse.redirect(loginUrl);
};

const unauthorizedApiResponse = (message: string, status: number) =>
  NextResponse.json(
    {
      ok: false,
      error: message
    },
    { status }
  );

export async function middleware(request: NextRequest) {
  if (!isProtectedRequest(request)) {
    return NextResponse.next();
  }

  if (!isAdminAuthConfigured()) {
    return pathnameIsApi(request.nextUrl.pathname)
      ? unauthorizedApiResponse('Admin authentication is not configured.', 503)
      : redirectToLogin(request, 'config');
  }

  const sessionValue = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!(await isAuthorizedAdminSession(sessionValue))) {
    return pathnameIsApi(request.nextUrl.pathname)
      ? unauthorizedApiResponse('Admin authentication required.', 401)
      : redirectToLogin(request, 'expired');
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/projects']
};
