import { createFileRoute } from '@tanstack/react-router';
import { prefetchJobs } from '@/lib/prefetch';
import { parseJobsSearch } from '@/lib/job-search';
import { Jobs } from '@/screens/jobs';

export const Route = createFileRoute('/_app/jobs/')({
  validateSearch: parseJobsSearch,
  loader: prefetchJobs,
  component: Jobs,
});
