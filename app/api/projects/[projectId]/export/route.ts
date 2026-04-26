import { NextResponse } from 'next/server';
import { createExportArtifact, getProjectSchema, toPublicProjectError } from '../../../../../lib/projects';
import { normalizeParameterValues } from '../../../../../lib/validation';

const parseExportFormat = (value: unknown) => {
  const normalized = String(value ?? '').toUpperCase();
  if (normalized === 'STL' || normalized === 'STEP') {
    return normalized as 'STL' | 'STEP';
  }
  throw new Error('Unsupported export format.');
};

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  try {
    const payload = (await request.json()) as { values?: Record<string, unknown>; format?: string };
    const schema = await getProjectSchema(projectId);
    const values = normalizeParameterValues(schema, payload.values);
    const format = parseExportFormat(payload.format);
    const artifact = await createExportArtifact(projectId, values, format);
    const fileBuffer = await import('node:fs/promises').then((mod) => mod.readFile(artifact.outputPath));

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': artifact.mimeType,
        'Content-Disposition': `attachment; filename="${artifact.fileName}"`
      }
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: toPublicProjectError(error, 'export') }, { status: 400 });
  }
}
