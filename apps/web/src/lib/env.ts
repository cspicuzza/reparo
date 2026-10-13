import { webEnv } from '@reparo/shared';

/** Validated at module load; the app refuses to start with a missing variable. */
export const env = webEnv(import.meta.env);
