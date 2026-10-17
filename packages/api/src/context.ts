import { eq, members, type Db, type Member, type MemberRole } from '@reparo/db';
import { VIEW_AS_HEADER, viewAsSchema } from '@reparo/shared';
import type { TokenClaims, TokenVerifier } from './auth';
import type { Storage } from './storage/storage';

/** What every procedure sees. `member` is null until the guard has run. */
export interface Context {
  db: Db;
  /** File storage (M4). Only `services/files.ts` uses it. */
  storage: Storage;
  /** The member, with `role` as the guards should see it (lowered while an admin previews). */
  member: Member | null;
  /** The role as stored, whatever is being previewed; null until the guard has run. */
  realRole: MemberRole | null;
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
  const none = { db: deps.db, storage: deps.storage, member: null, realRole: null };
  if (!token) return { ...none, authError: 'missing' };

  const claims = await deps.verify(token);
  if (!claims) return { ...none, authError: 'invalid' };

  const member = await lookupMember(deps.db, claims);
  if (!member) return { ...none, authError: 'not_a_member' };
  return {
    db: deps.db,
    storage: deps.storage,
    member: previewed(member, req.headers.get(VIEW_AS_HEADER)),
    realRole: member.role,
    authError: null,
  };
}

/**
 * An admin previewing the app as an editor or viewer is treated as that role (OD-133, Q194).
 * Only an admin, only downward: anyone else, or any other value, changes nothing.
 */
export function previewed(member: Member, asked: string | null): Member {
  if (member.role !== 'admin') return member;
  const viewAs = viewAsSchema.safeParse(asked);
  return viewAs.success ? { ...member, role: viewAs.data } : member;
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
