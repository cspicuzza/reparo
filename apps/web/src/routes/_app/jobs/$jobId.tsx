import { createFileRoute } from '@tanstack/react-router';
import { JobDetail } from '@/screens/job';

export const Route = createFileRoute('/_app/jobs/$jobId')({
  component: JobDetail,
});
