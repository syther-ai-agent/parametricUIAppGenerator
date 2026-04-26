import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from './env';
import { exportProjectFile, generateProjectPreview, type ParameterValue, toPublicProjectError } from './runtime';
import { getMimeType } from './mime';
import { inspectFreeCADModel } from '../src/fcstd';
import type {
  DownloadFormat,
  GeneratedModelSchema,
  ProjectCapabilities,
  ProjectRecord,
  ProjectSourceType
} from '../src/types';

type CreateProjectInput = {
  fileName: string;
  contents: Buffer;
  rootDir?: string;
};

export type ProjectBundle = {
  project: ProjectRecord;
  schema: GeneratedModelSchema;
};

export type ProjectPaths = {
  rootDir: string;
  projectDir: string;
  projectFile: string;
  sourceDir: string;
  derivedDir: string;
  cacheDir: string;
  previewDir: string;
  exportsDir: string;
};

const humanizeFileName = (fileName: string) =>
  path
    .basename(fileName, path.extname(fileName))
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (value) => value.toUpperCase());

const detectSourceType = (fileName: string): ProjectSourceType => {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.fcstd') return 'FCStd';
  if (ext === '.step' || ext === '.stp') return 'STEP';
  throw new Error('Unsupported file type. Upload an FCStd or STEP file.');
};

const buildCapabilities = (sourceType: ProjectSourceType): ProjectCapabilities =>
  sourceType === 'FCStd'
    ? {
        configurable: true,
        previewFormats: ['STL'],
        downloadFormats: ['STL', 'STEP']
      }
    : {
        configurable: false,
        previewFormats: ['STL'],
        downloadFormats: ['STEP']
      };

export const toProjectId = () => randomUUID().replace(/-/g, '').slice(0, 16);

export const getProjectPaths = (projectId: string, rootDir = env.projectsRootDir): ProjectPaths => {
  const projectDir = path.join(rootDir, projectId);
  return {
    rootDir,
    projectDir,
    projectFile: path.join(projectDir, 'project.json'),
    sourceDir: path.join(projectDir, 'source'),
    derivedDir: path.join(projectDir, 'derived'),
    cacheDir: path.join(projectDir, 'cache'),
    previewDir: path.join(projectDir, 'cache', 'previews'),
    exportsDir: path.join(projectDir, 'exports')
  };
};

const getSourcePath = async (paths: ProjectPaths) => {
  const files = await readdir(paths.sourceDir);
  const file = files.find(Boolean);
  if (!file) {
    throw new Error('Project source file is missing.');
  }
  return path.join(paths.sourceDir, file);
};

const writeJson = async (target: string, value: unknown) => {
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const ensureProjectWritesEnabled = () => {
  if (!env.allowProjectWrites) {
    throw new Error(
      `${env.deploymentTargetLabel} is running in read-only mode. New project uploads are disabled in this deployment.`
    );
  }
};

const ensureCadRuntimeEnabled = (action: 'preview' | 'export') => {
  if (!env.allowCadRuntime) {
    throw new Error(
      `${action === 'preview' ? 'Preview generation' : 'Export generation'} is disabled in this deployment. Bundled cached previews still work, but creating new CAD artifacts requires a FreeCAD-enabled server.`
    );
  }
};

export const createStepSchema = (fileName: string, projectId: string): GeneratedModelSchema => ({
  version: 1,
  modelId: projectId,
  title: humanizeFileName(fileName),
  source: {
    type: 'STEP',
    fileName
  },
  outputs: {
    preview: 'STL',
    downloads: ['STEP']
  },
  parameters: []
});

export const createProject = async ({ fileName, contents, rootDir }: CreateProjectInput): Promise<ProjectBundle> => {
  ensureProjectWritesEnabled();
  const sourceType = detectSourceType(fileName);
  const projectId = toProjectId();
  const paths = getProjectPaths(projectId, rootDir);
  const capabilities = buildCapabilities(sourceType);

  await mkdir(paths.sourceDir, { recursive: true });
  await mkdir(paths.derivedDir, { recursive: true });
  await mkdir(paths.previewDir, { recursive: true });
  await mkdir(paths.exportsDir, { recursive: true });

  const sourcePath = path.join(paths.sourceDir, `model${path.extname(fileName).toLowerCase()}`);
  await writeFile(sourcePath, contents);

  const schema =
    sourceType === 'FCStd' ? await inspectFreeCADModel(sourcePath) : createStepSchema(fileName, projectId);

  schema.modelId = projectId;
  schema.title = humanizeFileName(fileName);

  const project: ProjectRecord = {
    id: projectId,
    sourceType,
    sourceFileName: fileName,
    createdAt: new Date().toISOString(),
    title: schema.title,
    capabilities
  };

  await writeJson(paths.projectFile, project);
  await writeJson(path.join(paths.derivedDir, 'schema.json'), schema);

  return { project, schema };
};

export const getProject = async (projectId: string, rootDir = env.projectsRootDir): Promise<ProjectRecord> => {
  const paths = getProjectPaths(projectId, rootDir);
  const raw = await readFile(paths.projectFile, 'utf8');
  return JSON.parse(raw) as ProjectRecord;
};

export const getProjectSchema = async (projectId: string, rootDir = env.projectsRootDir): Promise<GeneratedModelSchema> => {
  const paths = getProjectPaths(projectId, rootDir);
  const raw = await readFile(path.join(paths.derivedDir, 'schema.json'), 'utf8');
  return JSON.parse(raw) as GeneratedModelSchema;
};

export const getProjectBundle = async (projectId: string, rootDir = env.projectsRootDir): Promise<ProjectBundle> => {
  const [project, schema] = await Promise.all([getProject(projectId, rootDir), getProjectSchema(projectId, rootDir)]);
  return { project, schema };
};

export const listProjects = async (rootDir = env.projectsRootDir): Promise<ProjectRecord[]> => {
  try {
    const entries = await readdir(rootDir, { withFileTypes: true });
    const bundles = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            return await getProject(entry.name, rootDir);
          } catch {
            return null;
          }
        })
    );
    return bundles.filter(Boolean).sort((left, right) => right!.createdAt.localeCompare(left!.createdAt)) as ProjectRecord[];
  } catch {
    return [];
  }
};

export const getProjectSourcePath = async (projectId: string, rootDir = env.projectsRootDir) => {
  return getSourcePath(getProjectPaths(projectId, rootDir));
};

export const getPreviewArtifactPath = (projectId: string, artifactId: string, format: 'stl' | 'glb', rootDir = env.projectsRootDir) =>
  path.join(getProjectPaths(projectId, rootDir).previewDir, `${artifactId}.${format}`);

const buildPreviewArtifactId = (projectId: string, values: Record<string, ParameterValue>) =>
  createHash('sha256')
    .update(projectId)
    .update(JSON.stringify(values, Object.keys(values).sort()))
    .digest('hex')
    .slice(0, 16);

export const createPreviewArtifact = async (
  projectId: string,
  values: Record<string, ParameterValue>,
  rootDir = env.projectsRootDir
) => {
  const project = await getProject(projectId, rootDir);
  const schema = await getProjectSchema(projectId, rootDir);
  const sourcePath = await getProjectSourcePath(projectId, rootDir);
  const artifactId = buildPreviewArtifactId(project.id, values);
  const format = 'stl' as const;
  const artifactPath = getPreviewArtifactPath(projectId, artifactId, format, rootDir);

  try {
    await stat(artifactPath);
  } catch {
    ensureCadRuntimeEnabled('preview');
    await generateProjectPreview({
      artifactPath,
      project,
      schema,
      sourcePath,
      values
    });
  }

  return {
    artifactId,
    format,
    previewUrl: `/api/projects/${projectId}/preview/${artifactId}?format=${format}`,
    mimeType: getMimeType(format),
    generatedAt: new Date().toISOString()
  };
};

export const createExportArtifact = async (
  projectId: string,
  values: Record<string, ParameterValue>,
  format: DownloadFormat,
  rootDir = env.projectsRootDir
) => {
  const project = await getProject(projectId, rootDir);
  const schema = await getProjectSchema(projectId, rootDir);
  const sourcePath = await getProjectSourcePath(projectId, rootDir);
  const paths = getProjectPaths(projectId, rootDir);

  if (!project.capabilities.downloadFormats.includes(format)) {
    throw new Error(`Download format ${format} is not supported for this project.`);
  }

  if (project.sourceType === 'STEP' && format === 'STEP') {
    return {
      fileName: project.sourceFileName,
      outputPath: sourcePath,
      mimeType: getMimeType(format)
    };
  }

  if (!env.allowCadRuntime && format === 'STL') {
    const artifactId = buildPreviewArtifactId(project.id, values);
    const outputPath = getPreviewArtifactPath(project.id, artifactId, 'stl', rootDir);
    await stat(outputPath);
    return {
      fileName: `${project.id}-${artifactId}.stl`,
      outputPath,
      mimeType: getMimeType(format)
    };
  }

  ensureCadRuntimeEnabled('export');

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const fileName = `${projectId}-${suffix}.${format.toLowerCase()}`;
  const outputPath = path.join(paths.exportsDir, fileName);

  await exportProjectFile({
    outputPath,
    project,
    schema,
    sourcePath,
    values,
    format: format.toLowerCase() as 'stl' | 'step'
  });

  return { fileName, outputPath, mimeType: getMimeType(format) };
};

export const readPreviewArtifact = async (
  projectId: string,
  artifactId: string,
  format: 'stl' | 'glb',
  rootDir = env.projectsRootDir
) => {
  const target = getPreviewArtifactPath(projectId, artifactId, format, rootDir);
  return readFile(target);
};

export const duplicateFixtureIntoProject = async (projectId: string, fixturePath: string, rootDir = env.projectsRootDir) => {
  const paths = getProjectPaths(projectId, rootDir);
  await mkdir(paths.sourceDir, { recursive: true });
  const dest = path.join(paths.sourceDir, path.basename(fixturePath));
  await copyFile(fixturePath, dest);
  return dest;
};

export { toPublicProjectError };
