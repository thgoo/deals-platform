// One-off: copies every table from the production MariaDB into the new Postgres
// schema (phase 5 cutover). Run it against an EMPTY, migrated Postgres.
//
//   MARIADB_URL=mysql://user:pass@127.0.0.1:3306/bargah_db \
//   DATABASE_URL=postgres://user:pass@127.0.0.1:5432/deals \
//   bun run scripts/mariadb-to-postgres.ts [--truncate]
//
// --truncate empties the target tables first (for rehearsals). Without it the
// script refuses to write into a non-empty database.
//
// What it fixes on the way (and reports):
//  - Duplicate deals (same chat + message_id): keeps the lowest id, drops the
//    others, repoints their match decisions to the kept deal.
//  - 513 embeddings were stored as a JSON string holding the array (instead of
//    the array itself); mysql2 hands those back as strings. Both shapes become
//    a proper vector.

import mysql from 'mysql2/promise';
import postgres from 'postgres';

const BATCH = 2000;

const mariadbUrl = process.env['MARIADB_URL'];
const postgresUrl = process.env['DATABASE_URL'];
if (!mariadbUrl || !postgresUrl?.startsWith('postgres')) {
  console.error('Set MARIADB_URL (source) and DATABASE_URL (postgres target).');
  process.exit(1);
}
const truncate = process.argv.includes('--truncate');

// timezone 'Z': MariaDB returns UTC wall-clock values (server time_zone = UTC);
// read them as UTC no matter what TZ this process runs in.
const src = await mysql.createConnection({ uri: mariadbUrl, timezone: 'Z', supportBigNumbers: true });
const dst = postgres(postgresUrl, { max: 4, connection: { TimeZone: 'UTC' }, onnotice: () => undefined });

type Row = Record<string, unknown>;

const TABLES = ['products', 'deals', 'product_url_mappings', 'product_match_decisions', 'alerts'];
const IDENTITY_TABLES = ['deals', 'product_url_mappings', 'product_match_decisions'];

function json(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

/** mysql2 parses JSON arrays itself; embeddings stored as a JSON string come back as strings. */
let stringEmbeddings = 0;
function embeddingLiteral(value: unknown): string {
  if (typeof value === 'string') stringEmbeddings++;
  const parsed = json(value);
  if (!Array.isArray(parsed) || parsed.length !== 1536) {
    throw new Error(`Embedding with ${Array.isArray(parsed) ? parsed.length : typeof parsed} dimensions`);
  }
  return `[${parsed.join(',')}]`;
}

/** Streams a table in keyset-paginated batches ordered by `key`. */
async function* batches(table: string, key: string): AsyncGenerator<Row[]> {
  let last: unknown = null;
  for (;;) {
    const where = last === null ? '' : `WHERE \`${key}\` > ?`;
    const [rows] = await src.query<mysql.RowDataPacket[]>(
      `SELECT * FROM \`${table}\` ${where} ORDER BY \`${key}\` LIMIT ${BATCH}`,
      last === null ? [] : [last],
    );
    if (rows.length === 0) return;
    yield rows as Row[];
    last = rows[rows.length - 1]![key];
  }
}

async function copy(
  table: string,
  key: string,
  map: (row: Row) => Row | null,
): Promise<{ read: number; written: number }> {
  let read = 0;
  let written = 0;
  for await (const rows of batches(table, key)) {
    read += rows.length;
    const out = rows.map(map).filter((r): r is Row => r !== null);
    if (out.length > 0) {
      await dst`INSERT INTO ${dst(table)} ${dst(out as Record<string, postgres.ParameterOrJSON<never>>[])}`;
      written += out.length;
    }
    process.stdout.write(`\r  ${table}: ${written}/${read}`);
  }
  process.stdout.write('\n');
  return { read, written };
}

// ── Preconditions ────────────────────────────────────────────────────────────
const nonEmpty: string[] = [];
for (const t of TABLES) {
  const [{ n }] = await dst`SELECT COUNT(*)::int AS n FROM ${dst(t)}`;
  if (n > 0) nonEmpty.push(`${t} (${n})`);
}
if (nonEmpty.length > 0) {
  if (!truncate) {
    console.error(`Target is not empty: ${nonEmpty.join(', ')}. Use --truncate for a rehearsal.`);
    process.exit(1);
  }
  await dst.unsafe(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  console.log(`Truncated: ${nonEmpty.join(', ')}`);
}

const started = Date.now();
const report: Record<string, { read: number; written: number }> = {};

// ── Duplicate deals ──────────────────────────────────────────────────────────
const [dupRows] = await src.query<mysql.RowDataPacket[]>(`
  SELECT d.id, k.keep_id
  FROM deals d
  JOIN (SELECT chat, message_id, MIN(id) AS keep_id FROM deals GROUP BY chat, message_id HAVING COUNT(*) > 1) k
    ON k.chat = d.chat AND k.message_id = d.message_id
  WHERE d.id <> k.keep_id
`);
const duplicateOf = new Map<number, number>(dupRows.map(r => [Number(r['id']), Number(r['keep_id'])]));

// ── Copy, in foreign-key order ───────────────────────────────────────────────
// users / sessions are not copied: the api has no user accounts (admin login lives in web).
report['products'] = await copy('products', 'id', r => ({
  id: r['id'],
  canonical_name: r['canonical_name'],
  model_key: r['model_key'],
  category: r['category'],
  embedding: embeddingLiteral(r['embedding']),
  embedding_model_version: r['embedding_model_version'],
  created_at: r['created_at'],
  updated_at: r['updated_at'],
}));

report['deals'] = await copy('deals', 'id', r => {
  if (duplicateOf.has(Number(r['id']))) return null;
  return {
    id: Number(r['id']),
    message_id: Number(r['message_id']),
    chat: r['chat'],
    chat_id: r['chat_id'],
    ts: r['ts'],
    text: r['text'],
    links: dst.json(json(r['links']) as postgres.JSONValue ?? []),
    price: r['price'],
    coupons: r['coupons'] === null ? null : dst.json(json(r['coupons']) as postgres.JSONValue),
    store: r['store'],
    description: r['description'],
    product: r['product'],
    category: r['category'],
    media_type: r['media_type'],
    photo_id: r['photo_id'],
    local_path: r['local_path'],
    product_id: r['product_id'],
    created_at: r['created_at'],
  };
});

report['product_url_mappings'] = await copy('product_url_mappings', 'id', r => ({
  id: Number(r['id']),
  source: r['source'],
  external_id: r['external_id'],
  product_id: r['product_id'],
  confidence: r['confidence'],
  created_at: r['created_at'],
}));

let repointedDecisions = 0;
report['product_match_decisions'] = await copy('product_match_decisions', 'id', r => {
  const dealId = Number(r['deal_id']);
  const keptId = duplicateOf.get(dealId);
  if (keptId !== undefined) repointedDecisions++;
  return {
    id: Number(r['id']),
    deal_id: keptId ?? dealId,
    product_id: r['product_id'],
    method: r['method'],
    top_candidates: r['top_candidates'] === null ? null : dst.json(json(r['top_candidates']) as postgres.JSONValue),
    similarity_score: r['similarity_score'],
    created_at: r['created_at'],
  };
});

report['alerts'] = await copy('alerts', 'id', r => ({
  id: r['id'],
  keyword: r['keyword'],
  subscription: dst.json(json(r['subscription']) as postgres.JSONValue),
  last_notified_price: r['last_notified_price'],
  created_at: r['created_at'],
  expires_at: r['expires_at'],
}));

// Identity sequences continue after the copied ids.
for (const t of IDENTITY_TABLES) {
  await dst.unsafe(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`);
}

// ── Verification ─────────────────────────────────────────────────────────────
console.log('\nVerification (MariaDB → Postgres):');
let ok = true;
const check = (label: string, expected: unknown, actual: unknown) => {
  const pass = String(expected) === String(actual);
  if (!pass) ok = false;
  console.log(`  ${pass ? '✓' : '✗'} ${label}: ${expected} → ${actual}`);
};

for (const t of TABLES) {
  const { read, written } = report[t]!;
  const [{ n }] = await dst`SELECT COUNT(*)::int AS n FROM ${dst(t)}`;
  const expected = t === 'deals' ? read - duplicateOf.size : read;
  check(`${t} rows`, expected, n);
  if (written !== n) ok = false;
}

const scalar = async (q: string) => Object.values(((await src.query<mysql.RowDataPacket[]>(q))[0][0]) ?? {})[0];
const dupIds = [...duplicateOf.keys()];
const notDup = dupIds.length ? `WHERE id NOT IN (${dupIds.join(',')})` : '';
const andNotDup = dupIds.length ? `AND id NOT IN (${dupIds.join(',')})` : '';

check('sum(price)', await scalar(`SELECT COALESCE(SUM(price), 0) FROM deals ${notDup}`),
  (await dst`SELECT COALESCE(SUM(price), 0)::bigint AS s FROM deals`)[0]!['s']);
check('deals with coupons', await scalar(`SELECT COUNT(*) FROM deals WHERE coupons IS NOT NULL ${andNotDup}`),
  (await dst`SELECT COUNT(*)::int AS n FROM deals WHERE coupons IS NOT NULL`)[0]!['n']);
check('deals linked to a product', await scalar(`SELECT COUNT(*) FROM deals WHERE product_id IS NOT NULL ${andNotDup}`),
  (await dst`SELECT COUNT(*)::int AS n FROM deals WHERE product_id IS NOT NULL`)[0]!['n']);
check('sum of deal timestamps (epoch s)', await scalar(`SELECT SUM(UNIX_TIMESTAMP(ts)) FROM deals ${notDup}`),
  (await dst`SELECT SUM(EXTRACT(EPOCH FROM ts))::bigint AS s FROM deals`)[0]!['s']);
check('newest deal (epoch s)', await scalar('SELECT UNIX_TIMESTAMP(MAX(ts)) FROM deals'),
  (await dst`SELECT EXTRACT(EPOCH FROM MAX(ts))::bigint AS s FROM deals`)[0]!['s']);
check('distinct stores (case/accent-insensitive)',
  await scalar(`SELECT COUNT(DISTINCT store) FROM deals ${notDup}`),
  (await dst`SELECT COUNT(DISTINCT store)::int AS n FROM deals`)[0]!['n']);

console.log(`\nDuplicate deals dropped: ${duplicateOf.size} (decisions repointed: ${repointedDecisions})`);
console.log(`Embeddings stored as JSON strings, normalized: ${stringEmbeddings}`);
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s — ${ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);

await src.end();
await dst.end();
process.exit(ok ? 0 : 1);
