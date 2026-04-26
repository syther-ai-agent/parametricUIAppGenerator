import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { env } from '../../lib/env';
import { listProjects } from '../../lib/projects';
import { UploadForm } from '../../components/upload-form';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent } from '../../components/ui/card';

export default async function AdminPage() {
  const projects = await listProjects();
  const hostedMode = !env.allowProjectWrites || !env.allowCadRuntime;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-5 sm:px-6 lg:px-8">
      <section className="grid gap-8 rounded-[28px] border border-white/70 bg-white/82 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-5">
          <Badge variant="accent">Admin Console</Badge>
          <div className="max-w-3xl space-y-3">
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-[3.75rem] lg:leading-[1.02]">
              Upload a model and publish a compact configurator in one step.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              FCStd files become configurable project pages. STEP files stay lightweight for preview and download. Everything
              runs inside one reusable host app.
            </p>
            {hostedMode ? (
              <div className="max-w-2xl rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm leading-6 text-amber-900">
                This {env.deploymentTargetLabel} is set up as a read-only viewer. Bundled sample projects still open, but new
                uploads and on-demand CAD generation are disabled here.
              </div>
            ) : null}
          </div>
        </div>
        <UploadForm deploymentTargetLabel={env.deploymentTargetLabel} uploadsEnabled={env.allowProjectWrites} />
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Existing Projects</h2>
          <p className="text-sm text-slate-500">Open a live project page and verify its preview, controls, and downloads.</p>
        </div>

        {projects.length === 0 ? (
          <Card className="border-slate-200/80 bg-white/85">
            <CardContent className="p-5 text-sm text-slate-500">No projects yet. Upload an FCStd or STEP file to create the first one.</CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <Link className="group block cursor-pointer" href={`/projects/${project.id}`} key={project.id}>
                <Card className="h-full border-slate-200/80 bg-white/88 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                  <CardContent className="flex h-full flex-col gap-5 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <Badge>{project.sourceType}</Badge>
                      <span className="text-[11px] text-slate-400">{new Date(project.createdAt).toLocaleDateString()}</span>
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-2xl font-semibold tracking-tight text-slate-950">{project.title}</h3>
                      <p className="truncate text-sm text-slate-500">{project.id}</p>
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-4">
                      <p className="text-sm text-slate-500">
                        {project.capabilities.configurable ? 'Configurable project' : 'Preview and download only'}
                      </p>
                      <div className="flex size-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition-transform duration-200 group-hover:translate-x-0.5">
                        <ArrowRight className="size-4" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
