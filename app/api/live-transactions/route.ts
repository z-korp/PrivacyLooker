import { NextResponse } from 'next/server';
import { LiveTransaction, EventType, WrapperContract, DataProvenance } from '@/types/graph';
import { formatTokenAmount } from '@/lib/tokenConfig';

// Zama Dashboard public Supabase (anon key — read-only, publicly embedded on zamadashboard.org)
const SUPABASE_URL = 'https://dnglwhjusohzbqsrrdds.supabase.co';
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuZ2x3aGp1c29oemJxc3JyZGRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NjE1ODcsImV4cCI6MjA4MjIzNzU4N30.3YXkvHqRERYADsYQ2Uqtcb6yMyCTyIwmEU6ojBYWhZI';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

const HEADERS = {
  apikey: SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
  'Content-Type': 'application/json',
};

/** Regular fetch — returns rows */
async function sb<T>(table: string, params: Record<string, string>): Promise<T[]> {
  const q = new URLSearchParams({ select: '*', ...params });
  const url = `${SUPABASE_URL}/rest/v1/${table}?${q}`;
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 30 } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase ${table} ${res.status}: ${body.slice(0, 120)}`);
  }
  return res.json();
}

/**
 * Count-only fetch via PostgREST `Prefer: count=exact`.
 * Returns the total number of matching rows from the Content-Range header.
 * Example: Content-Range: 0-0/37414 → returns 37414
 */
async function sbCount(table: string, params: Record<string, string>): Promise<number> {
  const q = new URLSearchParams({ select: 'transaction_hash', limit: '1', ...params });
  const url = `${SUPABASE_URL}/rest/v1/${table}?${q}`;
  const res = await fetch(url, {
    headers: { ...HEADERS, Prefer: 'count=exact' },
    next: { revalidate: 300 },
  });
  if (!res.ok) return 0;
  const cr = res.headers.get('content-range') ?? '';
  const total = parseInt(cr.split('/')[1] ?? '0', 10);
  return isNaN(total) ? 0 : total;
}

/** Parse an amount string that may be in scientific notation (e.g. "2.476e+24") */
function parseAmount(raw: string | null | undefined): number {
  if (!raw) return 0;
  const n = parseFloat(raw);
  return isFinite(n) ? n : 0;
}

// ── Types matching Supabase schema ───────────────────────────────────────────

interface RegisteredToken {
  token_address: string;
  token_symbol: string;
  token_decimals: number;
  wrapper_address: string;
  tvs_onchain: string | null;
}

interface WrapperEvent {
  transaction_hash: string;
  block_number: number;
  event_type: 'Wrap' | 'Unwrap';
  from_address: string | null;
  to_address: string | null;
  receiver_address: string | null;
  amount: string | null;
  cleartext_amount: string | null;
  token_symbol: string;
  token_decimals: number;
  wrapper_address: string;
  status: string;
}

interface ConfidentialTransfer {
  transaction_hash: string;
  block_number: number;
  wrapper_address: string;
  token_symbol: string;
  from_address: string;
  to_address: string;
  encrypted_amount: string;
}

// ── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchWrapperContracts(): Promise<WrapperContract[]> {
  const rows = await sb<RegisteredToken>('registered_tokens', {
    order: 'id.asc',
    is_valid: 'eq.true',
  });
  return rows.map((r) => ({
    wrapperAddress: r.wrapper_address.toLowerCase(),
    tokenAddress: r.token_address.toLowerCase(),
    tokenSymbol: r.token_symbol,
    tokenDecimals: r.token_decimals,
    tvs: r.tvs_onchain ? parseAmount(r.tvs_onchain) : 0,
  }));
}

async function fetchShieldEvents(
  limit = 300,
  fromTs?: string,
  toTs?: string,
  tokenSymbol?: string,
): Promise<LiveTransaction[]> {
  const q = new URLSearchParams({
    select: '*',
    order: 'block_number.desc',
    limit: String(limit),
    status: 'eq.success',
  });
  if (fromTs)      q.append('timestamp',    `gte.${fromTs}`);
  if (toTs)        q.append('timestamp',    `lte.${toTs}`);
  if (tokenSymbol && tokenSymbol !== 'ALL') q.append('token_symbol', `eq.${tokenSymbol}`);

  const url = `${SUPABASE_URL}/rest/v1/wrapper_events?${q}`;
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 30 } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase wrapper_events ${res.status}: ${body.slice(0, 120)}`);
  }
  const rows: WrapperEvent[] = await res.json();

  return rows
    .filter((e) => {
      const hasActor =
        e.event_type === 'Wrap' ? !!e.from_address : !!e.receiver_address;
      return hasActor;
    })
    .map((e): LiveTransaction => {
      const rawAmount = parseAmount(e.cleartext_amount ?? e.amount);
      const decimals = e.token_decimals ?? 6;
      const eventType: EventType = e.event_type === 'Wrap' ? 'wrap' : 'unwrap';
      const sym = e.token_symbol;

      const from =
        e.event_type === 'Wrap'
          ? (e.from_address ?? e.wrapper_address)
          : e.wrapper_address;
      const to =
        e.event_type === 'Wrap'
          ? e.wrapper_address
          : (e.receiver_address ?? e.to_address ?? e.wrapper_address);

      const transformLabel =
        eventType === 'wrap' ? `${sym} → c${sym}` : `c${sym} → ${sym}`;

      return {
        txHash: e.transaction_hash,
        from: from.toLowerCase(),
        to: to.toLowerCase(),
        token: sym,
        transformLabel,
        amount: rawAmount,
        amountFormatted: rawAmount > 0 ? formatTokenAmount(rawAmount, decimals) : '0',
        decimals,
        blockNumber: e.block_number,
        eventType,
      };
    });
}

async function fetchConfidentialTransfers(
  limit = 100,
  tokenSymbol?: string,
): Promise<LiveTransaction[]> {
  const params: Record<string, string> = {
    order: 'block_number.desc',
    limit: String(limit),
    from_address: `neq.${ZERO_ADDR}`,
  };
  if (tokenSymbol && tokenSymbol !== 'ALL') {
    params['token_symbol'] = `eq.${tokenSymbol}`;
  }
  const rows = await sb<ConfidentialTransfer>('confidential_transfers', params);

  return rows
    .filter(
      (e) =>
        e.from_address &&
        e.to_address &&
        e.from_address.toLowerCase() !== ZERO_ADDR &&
        e.to_address.toLowerCase() !== ZERO_ADDR &&
        e.from_address.toLowerCase() !== e.to_address.toLowerCase()
    )
    .map((e): LiveTransaction => ({
      txHash: e.transaction_hash,
      from: e.from_address.toLowerCase(),
      to: e.to_address.toLowerCase(),
      token: e.token_symbol,
      transformLabel: `c${e.token_symbol}`,
      amount: 0,
      amountFormatted: '🔒 Encrypted',
      decimals: 6,
      blockNumber: e.block_number,
      eventType: 'confidential',
    }));
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fromTs    = searchParams.get('from')  ?? undefined;
  const toTs      = searchParams.get('to')    ?? undefined;
  const tokenFilter = searchParams.get('token') ?? undefined; // 'USDT', 'USDC', etc.
  // When a week is selected, fetch more events (a single week can have 1K+ USDT txns)
  const shieldLimit = fromTs ? 1000 : 300;

  try {
    const [wrapperContracts, shieldTxs, totalWrap, totalConf] =
      await Promise.all([
        fetchWrapperContracts(),
        fetchShieldEvents(shieldLimit, fromTs, toTs, tokenFilter),
        sbCount('wrapper_events', { status: 'eq.success' }),
        sbCount('confidential_transfers', { from_address: `neq.${ZERO_ADDR}` }),
      ]);

    const allTxs = shieldTxs;

    // When a token filter is active, only expose that wrapper contract node
    // so the graph doesn't show idle rings for other tokens
    const visibleContracts = tokenFilter && tokenFilter !== 'ALL'
      ? wrapperContracts.filter((w) => w.tokenSymbol === tokenFilter)
      : wrapperContracts;

    // Block range across all fetched transactions
    const blockNumbers = allTxs.map((t) => t.blockNumber).filter(Boolean);
    const blockRange =
      blockNumbers.length > 0
        ? { min: Math.min(...blockNumbers), max: Math.max(...blockNumbers) }
        : null;

    const provenance: DataProvenance = {
      source: 'zamadashboard.org · Supabase',
      supabaseUrl: SUPABASE_URL,
      totalWrapEvents: totalWrap,
      totalConfidential: totalConf,
      blockRange,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(
      {
        transactions: allTxs,
        wrapperContracts: visibleContracts,
        provenance,
        fetchedAt: provenance.fetchedAt,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[live-transactions]', msg);
    return NextResponse.json(
      { error: msg, transactions: [], wrapperContracts: [], provenance: null },
      { status: 503 }
    );
  }
}
