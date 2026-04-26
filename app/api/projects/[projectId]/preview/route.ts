import { NextResponse } from 'next/server';
import { createPreviewArtifact, getProjectSchema, toPublicProjectError } from '../../../../../lib/projects';
import { normalizeParameterValues } from '../../../../../lib/validation';

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  try {
    const payload = (await request.json()) as { values?: Record<string, unknown> };
    const schema = await getProjectSchema(projectId);
    const values = normalizeParameterValues(schema, payload.values);
    const preview = await createPreviewArtifact(projectId, values);
    return NextResponse.json({ ok: true, ...preview });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: toPublicProjectError(error, 'preview') },
      { status: 400 }
    );
  }
}
