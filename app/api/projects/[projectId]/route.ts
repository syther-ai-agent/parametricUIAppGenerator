import { NextResponse } from 'next/server';
import { getProjectBundle } from '../../../../lib/projects';

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const bundle = await getProjectBundle(projectId);
    return NextResponse.json({ ok: true, ...bundle });
  } catch {
    return NextResponse.json({ ok: false, error: 'Project not found.' }, { status: 404 });
  }
}
