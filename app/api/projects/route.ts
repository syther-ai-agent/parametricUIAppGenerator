import { NextResponse } from 'next/server';
import { env } from '../../../lib/env';
import { createProject, listProjects } from '../../../lib/projects';

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json({ ok: true, projects });
}

export async function POST(request: Request) {
  if (!env.allowProjectWrites) {
    return NextResponse.json(
      {
        ok: false,
        error: `${env.deploymentTargetLabel} is running in read-only mode. Uploads are disabled in this deployment.`
      },
      { status: 503 }
    );
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'Upload a single FCStd or STEP file.' }, { status: 400 });
  }

  try {
    const contents = Buffer.from(await file.arrayBuffer());
    const result = await createProject({
      fileName: file.name,
      contents
    });

    return NextResponse.json({
      ok: true,
      projectId: result.project.id,
      redirectTo: `/projects/${result.project.id}`,
      project: result.project
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Project creation failed.' },
      { status: 400 }
    );
  }
}
