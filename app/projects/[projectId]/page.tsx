import { notFound } from 'next/navigation';
import { env } from '../../../lib/env';
import { getProjectBundle } from '../../../lib/projects';
import { ProjectPageClient } from '../../../components/project-page-client';

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  try {
    const bundle = await getProjectBundle(projectId);
    return (
      <ProjectPageClient
        cadRuntimeEnabled={env.allowCadRuntime}
        deploymentTargetLabel={env.deploymentTargetLabel}
        hostedMode={!env.allowProjectWrites || !env.allowCadRuntime}
        project={bundle.project}
        schema={bundle.schema}
      />
    );
  } catch {
    notFound();
  }
}
