import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../lib/env';
import { createExportArtifact, createProject, getProjectBundle, getProjectPaths } from '../lib/projects';

const tempDirs: string[] = [];

const createTempRoot = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'project-store-'));
  tempDirs.push(dir);
  return dir;
};

describe('project storage', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('creates an FCStd project and persists its schema and metadata', async () => {
    const rootDir = await createTempRoot();
    const contents = await readFile(path.join(process.cwd(), 'data', 'IDCardDesignWorking.FCStd'));

    const created = await createProject({
      fileName: 'IDCardDesignWorking.FCStd',
      contents,
      rootDir
    });

    const paths = getProjectPaths(created.project.id, rootDir);
    const persisted = await getProjectBundle(created.project.id, rootDir);

    expect(created.project.sourceType).toBe('FCStd');
    expect(created.project.capabilities.configurable).toBe(true);
    expect(created.schema.parameters.length).toBe(9);
    expect(persisted.schema.source.spreadsheetName).toBe('Spreadsheet');
    expect(persisted.project.title).toBe('IDCardDesignWorking');
    expect(paths.projectFile).toContain(created.project.id);
  });

  it('creates a STEP project with preview-only behavior', async () => {
    const rootDir = await createTempRoot();
    const contents = Buffer.from('ISO-10303-21; END-ISO-10303-21;', 'utf8');

    const created = await createProject({
      fileName: 'sample.step',
      contents,
      rootDir
    });

    expect(created.project.sourceType).toBe('STEP');
    expect(created.project.capabilities.configurable).toBe(false);
    expect(created.project.capabilities.downloadFormats).toEqual(['STEP']);
    expect(created.schema.parameters).toEqual([]);
    expect(created.schema.outputs.preview).toBe('STL');
  });

  it('serves STEP downloads from the original source file without generating a new artifact', async () => {
    const rootDir = await createTempRoot();
    const contents = Buffer.from('ISO-10303-21; END-ISO-10303-21;', 'utf8');

    const created = await createProject({
      fileName: 'sample.step',
      contents,
      rootDir
    });

    const artifact = await createExportArtifact(created.project.id, {}, 'STEP', rootDir);
    const exported = await readFile(artifact.outputPath, 'utf8');

    expect(artifact.fileName).toBe('sample.step');
    expect(exported).toBe('ISO-10303-21; END-ISO-10303-21;');
  });

  it('serves cached STL previews as downloads when CAD runtime is unavailable', async () => {
    const rootDir = await createTempRoot();
    const contents = await readFile(path.join(process.cwd(), 'data', 'IDCardDesignWorking.FCStd'));

    const created = await createProject({
      fileName: 'IDCardDesignWorking.FCStd',
      contents,
      rootDir
    });

    const values = Object.fromEntries(created.schema.parameters.map((parameter) => [parameter.id, parameter.defaultValue]));
    const artifactId = createHash('sha256')
      .update(created.project.id)
      .update(JSON.stringify(values, Object.keys(values).sort()))
      .digest('hex')
      .slice(0, 16);
    const previewPath = path.join(rootDir, created.project.id, 'cache', 'previews', `${artifactId}.stl`);
    await mkdir(path.dirname(previewPath), { recursive: true });
    await writeFile(previewPath, 'solid cached-preview', 'utf8');

    const previous = env.allowCadRuntime;
    let artifact;
    try {
      (env as { allowCadRuntime: boolean }).allowCadRuntime = false;
      artifact = await createExportArtifact(created.project.id, values, 'STL', rootDir);
    } finally {
      (env as { allowCadRuntime: boolean }).allowCadRuntime = previous;
    }

    expect(artifact.fileName).toBe(`${created.project.id}-${artifactId}.stl`);
    expect(await readFile(artifact.outputPath, 'utf8')).toBe('solid cached-preview');
  });
});
