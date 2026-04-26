'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';

export function UploadForm({
  deploymentTargetLabel,
  uploadsEnabled
}: {
  deploymentTargetLabel: string;
  uploadsEnabled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Card className="border-slate-200/80 bg-white/85">
      <CardHeader className="pb-4">
        <CardTitle>New project</CardTitle>
        <CardDescription className="text-xs leading-5">
          Upload one model file. FCStd enables live controls. STEP stays preview-and-download only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!uploadsEnabled) {
              setError(`${deploymentTargetLabel} is running in read-only mode. Uploads are disabled in this deployment.`);
              return;
            }
            const form = event.currentTarget;
            const data = new FormData(form);
            setError(null);

            startTransition(async () => {
              const response = await fetch('/api/projects', {
                method: 'POST',
                body: data
              });
              const payload = (await response.json()) as { ok: boolean; redirectTo?: string; error?: string };
              if (!response.ok || !payload.ok || !payload.redirectTo) {
                setError(payload.error ?? 'Upload failed.');
                return;
              }
              router.push(payload.redirectTo);
              router.refresh();
            });
          }}
        >
          <div className="grid gap-1.5">
            <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500" htmlFor="project-file">
              Model file
            </label>
            <Input accept=".fcstd,.step,.stp" disabled={!uploadsEnabled || isPending} id="project-file" name="file" required type="file" />
          </div>
          <Button className="w-full" disabled={!uploadsEnabled || isPending} type="submit">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {isPending ? 'Creating project…' : uploadsEnabled ? 'Create project' : 'Uploads disabled'}
          </Button>
          <p className="text-xs leading-5 text-slate-500">
            {uploadsEnabled
              ? 'Use FCStd for parametric controls and STEP for a simpler public viewer.'
              : 'This deployment can browse bundled projects, but new uploads need a writable server with FreeCAD.'}
          </p>
          {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
