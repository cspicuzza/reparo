// Which Supabase stack a script is about to use (OD-164). Pure, with only the global URL, so it
// fits here ("depends on nothing"); the CLI part (printing, --target, exit codes) is in
// @reparo/db/cli. Never print a URL's href: it holds the database password.

/** This machine. Node gives an IPv6 hostname with its brackets ("[::1]"). */
export const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export type Stack = { kind: 'local' } | { kind: 'hosted'; ref: string };

// Hosted hosts, per https://supabase.com/docs/guides/database/connecting-to-postgres (direct
// and dedicated pooler: db.<ref>.supabase.co; shared pooler: aws-<n>-<region>.pooler.supabase.com
// with user postgres.<ref>) and https://supabase.com/docs/guides/api (<ref>.supabase.co).
// The ref's characters are Assumed (the docs show only placeholders); anything that doesn't
// match is refused, so a wrong guess fails safe. A custom domain can't be mapped to a ref.
const DIRECT_DB = /^db\.([a-z0-9]+)\.supabase\.co$/;
const SHARED_POOLER = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/;
const PROJECT_API = /^([a-z0-9]+)\.supabase\.co$/;
const REF = /^[a-z0-9]+$/;

/**
 * `postgresql:` isn't a special URL scheme, so its host isn't lowercased by the parser
 * (https://url.spec.whatwg.org/#host-parsing); lowercase it before comparing.
 */
const host = (url: URL) => url.hostname.toLowerCase();

function databaseStack(url: URL): Stack | null {
  const h = host(url);
  if (LOCAL_HOSTS.has(h)) return { kind: 'local' };
  const direct = DIRECT_DB.exec(h);
  if (direct?.[1]) return { kind: 'hosted', ref: direct[1] };
  if (SHARED_POOLER.test(h)) {
    const user = decodeURIComponent(url.username);
    const dot = user.lastIndexOf('.');
    const ref = user.slice(dot + 1);
    return dot > 0 && REF.test(ref) ? { kind: 'hosted', ref } : null;
  }
  return null;
}

function storageStack(url: URL): Stack | null {
  const h = host(url);
  if (LOCAL_HOSTS.has(h)) return { kind: 'local' };
  const api = PROJECT_API.exec(h);
  return api?.[1] ? { kind: 'hosted', ref: api[1] } : null;
}

const label = (s: Stack | null) =>
  s === null
    ? 'not a host Reparo recognizes'
    : s.kind === 'local'
      ? 'this machine'
      : `project ${s.ref}`;

export type Target = {
  /** "db.abc.supabase.co:5432/postgres (project abc)": host, port, database; no password. */
  database: string;
  /** "abc.supabase.co (project abc)". */
  storage: string;
  /** The project both point at; null when both are this machine (or when there's a problem). */
  ref: string | null;
  /** Why the two aren't the same stack, or null when they are. */
  problem: string | null;
};

/**
 * Parse without echoing the value: Node's own error carries the whole input, password included
 * (observed, Node 22: ERR_INVALID_URL with `input`).
 */
function parseUrl(value: string, name: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new TypeError(`${name} isn't a valid URL.`);
  }
}

/**
 * Where `DATABASE_URL` and `SUPABASE_URL` point, and whether that's one stack. Throws a
 * TypeError naming the variable, never its value, on a URL it can't parse.
 */
export function describeTarget({
  databaseUrl,
  supabaseUrl,
}: {
  databaseUrl: string;
  supabaseUrl: string;
}): Target {
  const db = parseUrl(databaseUrl, 'DATABASE_URL');
  const api = parseUrl(supabaseUrl, 'SUPABASE_URL');
  const dbStack = databaseStack(db);
  const apiStack = storageStack(api);
  const target: Target = {
    database: `${host(db)}${db.port ? `:${db.port}` : ''}${db.pathname} (${label(dbStack)})`,
    storage: `${host(api)}${api.port ? `:${api.port}` : ''} (${label(apiStack)})`,
    ref: null,
    problem: null,
  };
  if (dbStack === null || apiStack === null) {
    target.problem =
      `The ${dbStack === null ? 'database' : 'storage'} host isn't this machine or a ` +
      "Supabase project host, so there's no telling which project it is.";
  } else if (dbStack.kind === 'local' && apiStack.kind === 'local') {
    // Both on this machine: the same stack.
  } else if (dbStack.kind === 'hosted' && apiStack.kind === 'hosted') {
    if (dbStack.ref === apiStack.ref) target.ref = dbStack.ref;
    else target.problem = `The database is ${label(dbStack)} but storage is ${label(apiStack)}.`;
  } else {
    target.problem = `The database is ${label(dbStack)} but storage is ${label(apiStack)}.`;
  }
  return target;
}

/**
 * Whether a run may go ahead (OD-164): a hosted project that will be written to needs
 * `--target=<ref>` naming it; a `--target` that names anything else is refused. Returns why
 * not, or null.
 */
export function confirmTarget(
  target: Pick<Target, 'ref'>,
  { flag, needed }: { flag: string | undefined; needed: boolean },
): string | null {
  if (target.ref === null) {
    return flag === undefined
      ? null
      : `--target=${flag} was given, but the database and storage are on this machine.`;
  }
  if (flag !== undefined && flag !== target.ref) {
    return `--target=${flag} doesn't match project ${target.ref}.`;
  }
  if (needed && flag === undefined) {
    return `This writes to project ${target.ref}. Run it again with --target=${target.ref} to confirm.`;
  }
  return null;
}
