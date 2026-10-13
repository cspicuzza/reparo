// Local API server for `pnpm dev`. Production uses apps/web/api/index.ts on Vercel; this runs
// the same router on tRPC's standalone adapter (https://trpc.io/docs/server/adapters/standalone)
// so Vite can proxy /api → here. Not used in deployment.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { createDeps, TRPC_ENDPOINT } from './handler';
import { createContext } from './context';
import { appRouter } from './routers';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const port = Number(process.env['API_PORT'] ?? 3001);
const deps = createDeps();

createHTTPServer({
  router: appRouter,
  basePath: `${TRPC_ENDPOINT}/`,
  createContext: ({ req }) => {
    // Standalone adapter hands us Node's IncomingMessage; build a Web Request for the shared context.
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers.set(k, v);
      else if (Array.isArray(v)) headers.set(k, v.join(', '));
    }
    return createContext(deps, new Request(`http://localhost${req.url ?? '/'}`, { headers }));
  },
}).listen(port);

console.log(`api: http://127.0.0.1:${port}${TRPC_ENDPOINT}`);
