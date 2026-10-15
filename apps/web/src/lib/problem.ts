/** The part of a Zod schema `problemWith` needs; keeps zod itself out of the web package. */
type Checkable = {
  safeParse: (
    value: unknown,
  ) => { success: true } | { success: false; error: { issues: { message: string }[] } };
};

/**
 * What to fix in a value before it's saved, from the same Zod schema the API checks it with, or
 * null when it's fine (OD-77: one-value edits validate before they save).
 */
export function problemWith(schema: Checkable, value: unknown): string | null {
  const result = schema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? 'Check this value');
}
