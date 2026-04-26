'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FileType2,
  FolderKanban,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal
} from 'lucide-react';
import type { GeneratedModelSchema, ProjectRecord } from '../src/types';
import { cn } from '../lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';

const ModelPreview = dynamic(() => import('./project-preview').then((module) => module.ProjectPreview), {
  ssr: false
});

type ParameterValue = string | number | boolean;
type PreviewState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; previewUrl: string; format: 'stl' | 'glb'; generatedAt: string }
  | { status: 'error'; message: string };

const isPrivateParameter = (parameter: GeneratedModelSchema['parameters'][number]) =>
  /^(private)\b/i.test(parameter.label) || /^(private)/i.test(parameter.id);

const buildInitialValues = (schema: GeneratedModelSchema) =>
  Object.fromEntries(schema.parameters.map((parameter) => [parameter.id, parameter.defaultValue])) as Record<string, ParameterValue>;

export function ProjectPageClient({
  cadRuntimeEnabled,
  deploymentTargetLabel,
  hostedMode,
  project,
  schema
}: {
  cadRuntimeEnabled: boolean;
  deploymentTargetLabel: string;
  hostedMode: boolean;
  project: ProjectRecord;
  schema: GeneratedModelSchema;
}) {
  const [values, setValues] = useState<Record<string, ParameterValue>>(() => buildInitialValues(schema));
  const [preview, setPreview] = useState<PreviewState>({ status: 'loading' });
  const [downloading, setDownloading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [privateControlsCollapsed, setPrivateControlsCollapsed] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const latestRequest = useRef(0);

  const { groupedParameters, privateParameters } = useMemo(() => {
    const visibleParameters = schema.parameters.filter((parameter) => !parameter.hidden);
    const privateParameters = visibleParameters.filter(isPrivateParameter);
    const groupedParameters = visibleParameters
      .filter((parameter) => !isPrivateParameter(parameter))
      .reduce<Record<string, typeof schema.parameters>>((groups, parameter) => {
        const group = parameter.group || 'General';
        groups[group] = [...(groups[group] ?? []), parameter];
        return groups;
      }, {});

    return { groupedParameters, privateParameters };
  }, [schema.parameters]);

  useEffect(() => {
    if (window.innerWidth < 1024) {
      setSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => {
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;
    setPreview({ status: 'loading' });
    setActionError(null);

    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/projects/${project.id}/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values })
      });

      const payload = (await response.json()) as
        | { ok: true; previewUrl: string; format: 'stl' | 'glb'; generatedAt: string }
        | { ok: false; error: string };

      if (requestId !== latestRequest.current) return;

      if (!response.ok || !payload.ok) {
        setPreview({
          status: 'error',
          message: payload.ok ? 'Preview generation failed.' : payload.error
        });
        return;
      }

      setPreview({
        status: 'ready',
        previewUrl: payload.previewUrl,
        format: payload.format,
        generatedAt: payload.generatedAt
      });
    }, 320);

    return () => {
      window.clearTimeout(timer);
    };
  }, [project.id, values]);

  const canDownloadFormat = (format: 'STL' | 'STEP') =>
    cadRuntimeEnabled ||
    (project.sourceType === 'STEP' && format === 'STEP') ||
    (format === 'STL' && preview.status === 'ready' && preview.format === 'stl');

  const downloadFile = async (format: 'STL' | 'STEP') => {
    if (!canDownloadFormat(format)) {
      setActionError(`${format} export is unavailable in this deployment.`);
      return;
    }

    setDownloading(format);
    setActionError(null);
    try {
      const response = await fetch(`/api/projects/${project.id}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values, format })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? 'Export failed.');
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition');
      const fileName = disposition?.match(/filename="([^"]+)"/)?.[1] ?? `${project.id}.${format.toLowerCase()}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setDownloading(null);
    }
  };

  const renderParameterControl = (parameter: GeneratedModelSchema['parameters'][number]) => (
    <label className="grid gap-1.5" key={parameter.id}>
      <span className="text-xs font-medium text-slate-700">{parameter.label}</span>
      {parameter.type === 'boolean' ? (
        <input
          checked={Boolean(values[parameter.id])}
          className="size-4 rounded border-slate-300 text-orange-500"
          onChange={(event) => {
            setValues((current) => ({ ...current, [parameter.id]: event.target.checked }));
          }}
          type="checkbox"
        />
      ) : parameter.type === 'enum' ? (
        <select
          className="h-8 rounded-md border border-slate-200 bg-white/90 px-3 text-sm outline-none ring-0 transition focus:border-orange-400"
          onChange={(event) => {
            setValues((current) => ({ ...current, [parameter.id]: event.target.value }));
          }}
          value={String(values[parameter.id])}
        >
          {parameter.enumOptions?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          max={parameter.constraints?.max}
          min={parameter.constraints?.min}
          onChange={(event) => {
            const raw = event.target.value;
            setValues((current) => ({
              ...current,
              [parameter.id]: parameter.type === 'text' ? raw : raw === '' ? '' : Number(raw)
            }));
          }}
          step={parameter.constraints?.step ?? (parameter.type === 'integer' ? 1 : 'any')}
          type={parameter.type === 'text' ? 'text' : 'number'}
          value={String(values[parameter.id])}
        />
      )}
      {parameter.description ? <span className="text-[11px] leading-5 text-slate-400">{parameter.description}</span> : null}
    </label>
  );

  return (
    <main className="relative h-screen overflow-hidden bg-transparent">
      <section
        className={cn(
          'absolute inset-y-3 left-3 z-20 flex flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/78 shadow-[0_18px_55px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-all duration-300',
          sidebarCollapsed ? 'w-14' : 'w-[268px] sm:w-[288px]'
        )}
      >
        {sidebarCollapsed ? (
          <div className="flex flex-1 flex-col items-center gap-2 px-2 py-3">
            <Button
              aria-expanded={!sidebarCollapsed}
              aria-label="Show controls"
              onClick={() => setSidebarCollapsed(false)}
              size="icon"
              title="Show controls"
              variant="outline"
            >
              <PanelLeftOpen className="size-4" />
            </Button>
            <div className="mt-2 flex size-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white/90 text-slate-700 shadow-sm">
              <FolderKanban className="size-4" />
            </div>
            <div className="flex size-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white/90 text-slate-700 shadow-sm">
              {project.capabilities.configurable ? <SlidersHorizontal className="size-4" /> : <Eye className="size-4" />}
            </div>
            <div className="mt-auto grid gap-2">
              {project.capabilities.downloadFormats.map((format) => (
                <Button
                  className="size-9 rounded-xl shadow-sm"
                  disabled={downloading === format || !canDownloadFormat(format)}
                  key={format}
                  onClick={() => downloadFile(format)}
                  size="icon"
                  title={`Download ${format}`}
                  variant={format === 'STL' ? 'default' : 'outline'}
                >
                  {format === 'STEP' ? <FileType2 className="size-4" /> : <Download className="size-4" />}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-3 border-b border-slate-200/70 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="accent">{project.sourceType}</Badge>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {schema.parameters.filter((parameter) => !parameter.hidden).length} controls
                  </span>
                </div>
                <Button
                  aria-expanded={!sidebarCollapsed}
                  aria-label="Collapse controls"
                  onClick={() => setSidebarCollapsed(true)}
                  size="icon"
                  title="Collapse controls"
                  variant="outline"
                >
                  <PanelLeftClose className="size-4" />
                </Button>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Review</p>
                  <h1 className="truncate text-base font-semibold tracking-tight text-slate-950">{project.title}</h1>
                  <p className="truncate text-xs text-slate-500">{project.sourceFileName}</p>
                </div>
                <span className="shrink-0 pt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                  {preview.status === 'ready' ? new Date(preview.generatedAt).toLocaleTimeString() : 'Updating'}
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {project.capabilities.configurable ? (
                <div className="space-y-4">
                  {Object.entries(groupedParameters).map(([group, parameters]) => (
                    <section className="space-y-2.5" key={group}>
                      <div className="flex items-center justify-between">
                        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{group}</h2>
                        <span className="text-[11px] text-slate-400">{parameters.length}</span>
                      </div>
                      <div className="space-y-2.5">
                        {parameters.map(renderParameterControl)}
                      </div>
                    </section>
                  ))}
                  {privateParameters.length > 0 ? (
                    <section className="mt-5 space-y-2.5 border-t border-slate-200/70 pt-4">
                      <button
                        aria-controls="private-controls-panel"
                        aria-expanded={!privateControlsCollapsed}
                        className="flex w-full items-center justify-between rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 text-left transition hover:border-slate-300 hover:bg-white/90"
                        onClick={() => setPrivateControlsCollapsed((current) => !current)}
                        type="button"
                      >
                        <div className="flex items-center gap-2">
                          {privateControlsCollapsed ? <ChevronRight className="size-4 text-slate-400" /> : <ChevronDown className="size-4 text-slate-400" />}
                          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Private</span>
                        </div>
                        <span className="text-[11px] text-slate-400">{privateParameters.length}</span>
                      </button>
                      {!privateControlsCollapsed ? (
                        <div className="space-y-2.5" id="private-controls-panel">
                          <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2.5 text-[11px] leading-5 text-amber-900">
                            Most users will not need to change private controls. Use them only for print tuning, material
                            adjustments, or troubleshooting.
                          </div>
                          {privateParameters.map(renderParameterControl)}
                        </div>
                      ) : null}
                    </section>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-4 text-xs leading-5 text-slate-500">
                  This STEP project exposes preview and download actions only in v1.
                </div>
              )}
            </div>

            <div className="border-t border-slate-200/70 px-4 py-3">
              <div className="grid gap-2">
                {project.capabilities.downloadFormats.map((format) => (
                  <Button
                    className="h-9 justify-between"
                    disabled={downloading === format || !canDownloadFormat(format)}
                    key={format}
                    onClick={() => downloadFile(format)}
                    variant={format === 'STL' ? 'default' : 'outline'}
                  >
                    <span>
                      {downloading === format
                        ? `Preparing ${format}…`
                        : canDownloadFormat(format)
                          ? `Download ${format}`
                          : `${format} unavailable here`}
                    </span>
                    {downloading === format ? <Loader2 className="size-4 animate-spin" /> : format === 'STEP' ? <FileType2 className="size-4" /> : <Download className="size-4" />}
                  </Button>
                ))}
              </div>
              {actionError ? <p className="mt-2 text-xs font-medium text-rose-600">{actionError}</p> : null}
            </div>
          </div>
        )}
      </section>

      <section className={cn('relative h-screen transition-[padding] duration-300', sidebarCollapsed ? 'pl-16' : 'pl-[286px] sm:pl-[306px]')}>
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-end px-4 py-3">
          {preview.status === 'ready' ? (
            <div className="rounded-lg bg-white/70 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500 shadow-sm backdrop-blur">
              Updated {new Date(preview.generatedAt).toLocaleTimeString()}
            </div>
          ) : null}
        </div>

        {preview.status === 'error' ? (
          <div className="flex h-full items-center justify-center px-6">
            <div className="max-w-md rounded-2xl border border-rose-200 bg-white/90 p-6 text-center shadow-sm">
              <p className="text-sm font-semibold text-rose-700">Preview unavailable</p>
              <p className="mt-2 text-sm leading-6 text-rose-500">{preview.message}</p>
            </div>
          </div>
        ) : preview.status === 'ready' ? (
          <ModelPreview format={preview.format} previewUrl={preview.previewUrl} />
        ) : (
          <div className="flex h-full items-center justify-center px-6">
            <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-sm text-slate-600 shadow-sm backdrop-blur">
              <Loader2 className="size-4 animate-spin" />
              Generating preview…
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
