import { createFileRoute } from '@tanstack/react-router';
import { parseJobSearch } from '@/lib/job-search';
import { prefetchJob } from '@/lib/prefetch';
import { JobDetail } from '@/screens/job';

export const Route = createFileRoute('/_app/jobs/$jobId')({
  // `?estimate=<id>` opens that estimate to edit (OD-119, Q145).
  validateSearch: parseJobSearch,
  // Starts every section's data at once, without holding the page back (OD-115, Q137).
  loader: ({ params }) => prefetchJob(params.jobId),
  component: JobDetail,
});
