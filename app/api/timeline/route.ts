import { NextResponse } from 'next/server';
import { TimelineWeek } from '@/types/graph';

const SUPABASE_URL = 'https://dnglwhjusohzbqsrrdds.supabase.co';
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuZ2x3aGp1c29oemJxc3JyZGRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NjE1ODcsImV4cCI6MjA4MjIzNzU4N30.3YXkvHqRERYADsYQ2Uqtcb6yMyCTyIwmEU6ojBYWhZI';

const HEADERS = {
  apikey: SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
};

interface EventRow {
  timestamp: number;
  token_symbol: string | null;
  event_type: string;
}

/** Unix timestamp of the Monday 00:00 UTC that contains the given timestamp */
function getWeekStart(ts: number): number {
  const d = new Date(ts * 1000);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon…6=Sat
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  d.setUTCHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function weekLabel(weekStartTs: number): string {
  return new Date(weekStartTs * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Tokens shown in the timeline (filter out test/unknown tokens) */
const VALID_TOKENS = new Set(['USDT', 'USDC', 'ZAMA', 'WETH', 'BRON', 'XAUt', 'tGBP']);

export async function GET() {
  try {
    // ── Step 1: get total count ───────────────────────────────────────────────
    const countRes = await fetch(
      `${SUPABASE_URL}/rest/v1/wrapper_events?select=transaction_hash&status=eq.success&limit=1`,
      { headers: { ...HEADERS, Prefer: 'count=exact' }, next: { revalidate: 3600 } }
    );
    const cr = countRes.headers.get('content-range') ?? '0/0';
    const total = parseInt(cr.split('/')[1] ?? '0', 10) || 0;

    // ── Step 2: paginate all rows in parallel batches ─────────────────────────
    const LIMIT = 1000;
    const pages = Math.ceil(total / LIMIT);
    const allRows: EventRow[] = [];

    const BATCH = 5; // concurrent requests per round
    for (let i = 0; i < pages; i += BATCH) {
      const batchFetches = Array.from({ length: Math.min(BATCH, pages - i) }, (_, j) => {
        const offset = (i + j) * LIMIT;
        const url =
          `${SUPABASE_URL}/rest/v1/wrapper_events` +
          `?select=timestamp,token_symbol,event_type&status=eq.success` +
          `&order=timestamp.asc&limit=${LIMIT}&offset=${offset}`;
        return fetch(url, { headers: HEADERS, next: { revalidate: 3600 } })
          .then((r) => r.json() as Promise<EventRow[]>)
          .catch(() => [] as EventRow[]);
      });
      const results = await Promise.all(batchFetches);
      for (const rows of results) {
        if (Array.isArray(rows)) allRows.push(...rows);
      }
    }

    // ── Step 3: aggregate into weekly buckets ─────────────────────────────────
    const buckets = new Map<number, TimelineWeek>();
    const tokenSet = new Set<string>();

    for (const row of allRows) {
      if (!row.timestamp || !row.token_symbol) continue;
      const sym = row.token_symbol;
      if (!VALID_TOKENS.has(sym)) continue;

      const et: 'wrap' | 'unwrap' =
        row.event_type?.toLowerCase() === 'wrap' ? 'wrap' : 'unwrap';
      const ws = getWeekStart(row.timestamp);

      tokenSet.add(sym);

      if (!buckets.has(ws)) {
        buckets.set(ws, {
          weekStart: ws,
          weekEnd: ws + 7 * 86400 - 1,
          weekLabel: weekLabel(ws),
          tokens: {},
          total: { wrap: 0, unwrap: 0 },
        });
      }

      const b = buckets.get(ws)!;
      if (!b.tokens[sym]) b.tokens[sym] = { wrap: 0, unwrap: 0 };
      b.tokens[sym][et]++;
      b.total[et]++;
    }

    const weeks = Array.from(buckets.values()).sort((a, b) => a.weekStart - b.weekStart);

    // Prioritize main tokens in display order
    const TOKEN_ORDER = ['USDT', 'USDC', 'ZAMA', 'WETH', 'BRON', 'XAUt', 'tGBP'];
    const tokens = TOKEN_ORDER.filter((t) => tokenSet.has(t));

    return NextResponse.json(
      { weeks, tokens, totalFetched: allRows.length },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown';
    console.error('[timeline]', msg);
    return NextResponse.json({ error: msg, weeks: [], tokens: [] }, { status: 503 });
  }
}
