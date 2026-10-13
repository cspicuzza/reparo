import { sql } from 'drizzle-orm';
import { check, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns';

/** ADR-008. Admin: everything + members/roles/items/phases/hard deletes. Editor: edits all. Viewer: reads all. */
export const memberRole = pgEnum('member_role', ['admin', 'editor', 'viewer']);
export type MemberRole = (typeof memberRole.enumValues)[number];

/** Who may sign in. The API guard rejects any Google account whose email isn't here. */
export const members = pgTable(
  'members',
  {
    id: id(),
    /** Lowercased; the check constraint enforces it so lookups by email are exact. */
    email: text('email').notNull().unique(),
    displayName: text('display_name').notNull(),
    role: memberRole('role').notNull().default('viewer'),
    /** Supabase Auth user id, set on first sign-in. */
    supabaseUserId: uuid('supabase_user_id').unique(),
    ...timestamps(),
  },
  (t) => [check('members_email_lowercase', sql`${t.email} = lower(${t.email})`)],
);

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
