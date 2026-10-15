import { eq, members, type Db, type Member } from '@reparo/db';
import type { TokenClaims, TokenVerifier } from './auth';
import type { Storage } from './storage/storage';

/** What every procedure sees. `member` is null until the guard has run. */
export interface Context {
  db: Db;
  /** File storage (M4). Only `services/files.ts` uses it. */
  storage: Storage;
  member: Member | null;
  /** Why `member` is null, for the guard to turn into the right error. */
  authError: 'missing' | 'invalid' | 'not_a_member' | null;
}

export interface ContextDeps {
  db: Db;
  verify: TokenVerifier;
  storage: Storage;
}

/** Build the per-request context from the Authorization header. Never throws. */
export async function createContext(deps: ContextDeps, req: Request): Promise<Context> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) return { db: deps.db, storage: deps.storage, member: null, authError: 'missing' };

  const claims = await deps.verify(token);
  if (!claims) return { db: deps.db, storage: deps.storage, member: null, authError: 'invalid' };

  const member = await lookupMember(deps.db, claims);
  if (!member)
    return { db: deps.db, storage: deps.storage, member: null, authError: 'not_a_member' };
  return { db: deps.db, storage: deps.storage, member, authError: null };
}

/** Find the member for a verified token; record the Supabase user id on first sight. */
async function lookupMember(db: Db, claims: TokenClaims): Promise<Member | null> {
  const email = claims.email.toLowerCase();
  const [found] = await db.select().from(members).where(eq(members.email, email)).limit(1);
  if (!found) return null;
  if (found.supabaseUserId !== claims.sub) {
    const [updated] = await db
      .update(members)
      .set({ supabaseUserId: claims.sub })
      .where(eq(members.id, found.id))
      .returning();
    return updated ?? found;
  }
  return found;
}
