// The one Vercel function (ADR-012): Web-standard fetch handler, all /api/trpc/* routes
// rewritten here by apps/web/vercel.json. No `@/` alias in this directory — Vercel doesn't
// support tsconfig path mappings under api/ (https://vercel.com/docs/functions/runtimes/node-js).
import { createDeps, createFetchHandler } from '@reparo/api';

const handler = createFetchHandler(createDeps());

export default {
  fetch(request: Request): Promise<Response> {
    return handler(request);
  },
};
