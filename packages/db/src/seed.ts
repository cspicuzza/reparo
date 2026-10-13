import { z } from 'zod';
import { createDb, type Db } from './client';
import { memberRole, members, type MemberRole } from './schema';

const entry = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  role: z.enum(memberRole.enumValues),
});

/**
 * Parse `MEMBERS="chris@example.com:admin,nikki@example.com:editor"`. Display name defaults
 * to the part before `@` and is only set on insert, so renames in the app survive re-seeding.
 */
export function parseMembers(
  spec: string | undefined,
): Array<{ email: string; role: MemberRole; displayName: string }> {
  if (!spec || spec.trim() === '') throw new Error('MEMBERS is empty; see .env.example');
  return spec.split(',').map((raw) => {
    const [email, role] = raw.trim().split(':');
    const parsed = entry.safeParse({ email, role });
    if (!parsed.success)
      throw new Error(
        `MEMBERS entry "${raw.trim()}" must be email:role (role ∈ admin|editor|viewer)`,
      );
    return { ...parsed.data, displayName: parsed.data.email.split('@')[0] ?? parsed.data.email };
  });
}

/** Upsert members by email on an existing handle (or transaction). Returns rows written. */
export async function upsertMembers(db: Db, spec: string | undefined): Promise<number> {
  const rows = parseMembers(spec);
  for (const row of rows) {
    await db
      .insert(members)
      .values(row)
      .onConflictDoUpdate({ target: members.email, set: { role: row.role } });
  }
  return rows.length;
}

/** `pnpm db:seed`: open a connection, upsert, close. */
export async function seedMembers(databaseUrl: string, spec: string | undefined): Promise<number> {
  const { db, client } = createDb(databaseUrl, { max: 1 });
  try {
    return await upsertMembers(db, spec);
  } finally {
    await client.end();
  }
}
