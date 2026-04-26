import { access } from 'node:fs/promises';
import path from 'node:path';
import { constants as fsConstants } from 'node:fs';

const cwd = process.cwd();
const isEnabled = (value: string | undefined) => value === '1' || value === 'true';
const isVercel = process.env.VERCEL === '1';

const FREECAD_CANDIDATES = [
  process.env.FREECAD_EXECUTABLE_PATH,
  '/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd',
  '/Applications/FreeCAD.app/Contents/MacOS/FreeCAD',
  'FreeCADCmd'
].filter(Boolean) as string[];

const isAccessible = async (target: string) => {
  if (!target.includes('/')) return true;
  try {
    await access(target, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
};

export const resolveFreecadExecutablePath = async () => {
  for (const candidate of FREECAD_CANDIDATES) {
    if (await isAccessible(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'FreeCAD runtime is not configured. Install FreeCAD or set FREECAD_EXECUTABLE_PATH to a working executable.'
  );
};

export const env = {
  isVercel,
  deploymentTargetLabel: isVercel ? 'Vercel' : 'local server',
  allowProjectWrites: isEnabled(process.env.ALLOW_PROJECT_WRITES) || !isVercel,
  allowCadRuntime: isEnabled(process.env.ALLOW_CAD_RUNTIME) || !isVercel,
  projectsRootDir: process.env.PROJECTS_ROOT_DIR ?? path.join(cwd, 'projects-data'),
  freecadTempDir: process.env.FREECAD_TEMP_DIR ?? path.join(cwd, '.freecad-temp'),
  freecadRequestTimeoutMs: Number(process.env.FREECAD_REQUEST_TIMEOUT_MS ?? '120000'),
  freecadPreviewFormat: (process.env.FREECAD_PREVIEW_FORMAT ?? 'stl').toLowerCase() === 'glb' ? 'glb' : 'stl'
} as const;
