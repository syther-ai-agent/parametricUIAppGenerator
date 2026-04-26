import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { env, resolveFreecadExecutablePath } from './env';
import type { DownloadFormat, GeneratedModelSchema, ProjectRecord } from '../src/types';

export type ParameterValue = string | number | boolean;

type RuntimeArgs = {
  project: ProjectRecord;
  schema: GeneratedModelSchema;
  sourcePath: string;
  values: Record<string, ParameterValue>;
};

type PreviewArgs = RuntimeArgs & {
  artifactPath: string;
};

type ExportArgs = RuntimeArgs & {
  format: 'stl' | 'step';
  outputPath: string;
};

const runnerPath = path.join(process.cwd(), 'freecad', 'run_model.py');

const invokeFreecad = async (payload: Record<string, unknown>) => {
  const executable = await resolveFreecadExecutablePath();
  await mkdir(env.freecadTempDir, { recursive: true });
  const tempDir = await mkdtemp(path.join(env.freecadTempDir, 'job-'));
  const requestPath = path.join(tempDir, 'request.json');
  const responsePath = path.join(tempDir, 'response.json');

  try {
    await writeFile(requestPath, JSON.stringify(payload, null, 2), 'utf8');

    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, [runnerPath, requestPath, responsePath], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stderr = '';
      let stdout = '';
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`FreeCAD invocation timed out after ${env.freecadRequestTimeoutMs}ms.`));
      }, env.freecadRequestTimeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on('exit', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`FreeCAD exited with code ${code}. ${stderr || stdout}`.trim()));
      });
    });

    const raw = await readFile(responsePath, 'utf8');
    const result = JSON.parse(raw) as { ok: boolean; error?: string; traceback?: string };

    if (!result.ok) {
      throw new Error(result.traceback ? `${result.error}\n${result.traceback}` : result.error ?? 'FreeCAD execution failed.');
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

export const generateProjectPreview = async ({ artifactPath, project, schema, sourcePath, values }: PreviewArgs) => {
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await invokeFreecad({
    operation: 'preview',
    projectType: project.sourceType,
    modelPath: sourcePath,
    spreadsheetName: schema.source.spreadsheetName,
    parameters: values,
    outputPath: artifactPath,
    format: 'stl'
  });
};

export const exportProjectFile = async ({
  outputPath,
  project,
  schema,
  sourcePath,
  values,
  format
}: ExportArgs) => {
  await mkdir(path.dirname(outputPath), { recursive: true });

  if (project.sourceType === 'STEP' && format === 'step') {
    await writeFile(outputPath, await readFile(sourcePath));
    return;
  }

  await invokeFreecad({
    operation: 'export',
    projectType: project.sourceType,
    modelPath: sourcePath,
    spreadsheetName: schema.source.spreadsheetName,
    parameters: values,
    outputPath,
    format
  });
};

export const toPublicProjectError = (error: unknown, action: 'preview' | 'export') => {
  const message = error instanceof Error ? error.message : 'Unknown error.';
  if (
    message.includes('FreeCAD runtime is not configured') ||
    message.includes('spawn') ||
    message.includes('ENOENT')
  ) {
    return `${action === 'preview' ? 'Preview' : 'Export'} is unavailable until the server FreeCAD runtime is configured.`;
  }
  return message;
};
