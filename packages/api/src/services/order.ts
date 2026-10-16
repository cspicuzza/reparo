/**
 * A list with one row moved one place up (-1) or down (+1); unchanged at either end. Rooms and
 * phases are reordered this way instead of by typing a number (OD-117, Q141).
 */
export function moved<T extends { id: string }>(rows: T[], id: string, by: -1 | 1): T[] {
  const from = rows.findIndex((r) => r.id === id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= rows.length) return rows;
  const next = [...rows];
  const [row] = next.splice(from, 1);
  if (row) next.splice(to, 0, row);
  return next;
}
