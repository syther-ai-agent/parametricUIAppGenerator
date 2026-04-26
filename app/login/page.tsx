import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LockKeyhole } from 'lucide-react';
import { ADMIN_SESSION_COOKIE, isAdminAuthConfigured, isAuthorizedAdminSession, sanitizeNextPath } from '../../lib/admin-auth';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';

const errorMessage = (error: string | undefined) => {
  if (error === 'invalid') {
    return 'The username or password was incorrect.';
  }
  if (error === 'config') {
    return 'Admin login is not configured yet. Set ADMIN_USERNAME and ADMIN_PASSWORD on the server.';
  }
  if (error === 'expired') {
    return 'Please sign in to continue to the admin area.';
  }
  return null;
};

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string; loggedOut?: string }>;
}) {
  const params = await searchParams;
  const next = sanitizeNextPath(params.next);
  const sessionValue = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;

  if (isAdminAuthConfigured() && (await isAuthorizedAdminSession(sessionValue))) {
    redirect(next);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid w-full gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
        <div className="space-y-5">
          <Badge variant="accent">Admin Access</Badge>
          <div className="max-w-3xl space-y-3">
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-[3.75rem] lg:leading-[1.02]">
              Sign in to manage parametric projects.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              Public project pages stay shareable. Only the admin workspace for creating and managing projects requires sign-in.
            </p>
          </div>
        </div>

        <Card className="border-white/70 bg-white/88">
          <CardHeader className="pb-4">
            <div className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 ring-1 ring-orange-100">
              <LockKeyhole className="size-5" />
            </div>
            <CardTitle className="text-xl">Admin login</CardTitle>
            <CardDescription>Use the server-side admin credentials configured for this deployment.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action="/api/admin/session" className="grid gap-3" method="post">
              <input name="next" type="hidden" value={next} />
              <div className="grid gap-1.5">
                <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500" htmlFor="username">
                  Username
                </label>
                <Input autoComplete="username" id="username" name="username" required type="text" />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500" htmlFor="password">
                  Password
                </label>
                <Input autoComplete="current-password" id="password" name="password" required type="password" />
              </div>
              <Button className="mt-2 w-full" type="submit">
                Sign in
              </Button>
              {params.loggedOut === '1' ? <p className="text-xs font-medium text-slate-500">You have been signed out.</p> : null}
              {errorMessage(params.error) ? <p className="text-xs font-medium text-rose-600">{errorMessage(params.error) as string}</p> : null}
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
