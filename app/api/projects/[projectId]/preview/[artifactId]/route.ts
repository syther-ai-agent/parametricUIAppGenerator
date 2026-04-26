import { NextResponse } from 'next/server';
import { readPreviewArtifact } from '../../../../../../lib/projects';
import { getMimeType } from '../../../../../../lib/mime';

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; artifactId: string }> }) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') === 'glb' ? 'glb' : 'stl';
  const { projectId, artifactId } = await params;

  try {
    const artifact = await readPreviewArtifact(projectId, artifactId, format);
    return new NextResponse(artifact, {
      headers: {
        'Content-Type': getMimeType(format),
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Preview artifact not found.' }, { status: 404 });
  }
}
