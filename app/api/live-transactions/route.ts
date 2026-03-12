import { NextResponse } from 'next/server';
import { LiveTransaction, EventType, WrapperContract } from '@/types/graph';
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

async function sb<T>(table: string, params: Record<string, string>): Promise<T[]> {
  const q = new URLSearchParams({ select: '*', ...params });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${q}`, {
    headers: HEADERS,
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error(`Supabase ${table}: ${res.status}`);
  return res.json();
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
  token_address: string;
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
    tvs: r.tvs_onchain ? Number(r.tvs_onchain) : 0,
  }));
}

async function fetchShieldEvents(limit = 60): Promise<LiveTransaction[]> {
  const rows = await sb<WrapperEvent>('wrapper_events', {
    order: 'block_number.desc',
    limit: String(limit),
    status: 'eq.success',
  });

  return rows
    .filter((e) => (e.from_address || e.receiver_address) && e.amount && Number(e.amount) > 0)
    .map((e): LiveTransaction => {
      const raw = BigInt(e.cleartext_amount ?? e.amount ?? '0');
      const decimals = e.token_decimals ?? 18;
      const eventType: EventType = e.event_type === 'Wrap' ? 'wrap' : 'unwrap';

      // Wrap (Shield):   user wallet → wrapper contract
      // Unwrap (Unshield): wrapper contract → user wallet
      const from =
        e.event_type === 'Wrap'
          ? (e.from_address ?? e.wrapper_address)
          : e.wrapper_address;
      const to =
        e.event_type === 'Wrap'
          ? e.wrapper_address
          : (e.receiver_address ?? e.to_address ?? e.wrapper_address);

      return {
        txHash: e.transaction_hash,
        from: from.toLowerCase(),
        to: to.toLowerCase(),
        token: e.token_symbol,
        amount: Number(raw),
        amountFormatted: formatTokenAmount(raw, decimals),
        decimals,
        blockNumber: e.block_number,
        eventType,
      };
    });
}

async function fetchConfidentialTransfers(limit = 40): Promise<LiveTransaction[]> {
  const rows = await sb<ConfidentialTransfer>('confidential_transfers', {
    order: 'block_number.desc',
    limit: String(limit),
    // Exclude mint events (from = zero address = Shield already captured above)
    'from_address': `neq.${ZERO_ADDR}`,
  });

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
      // Amount is FHE-encrypted — never knowable in plaintext
      amount: 0,
      amountFormatted: '🔒 Encrypted',
      decimals: 6,
      blockNumber: e.block_number,
      eventType: 'confidential',
    }));
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const [wrapperContracts, shieldTxs, confidentialTxs] = await Promise.all([
      fetchWrapperContracts(),
      fetchShieldEvents(60),
      fetchConfidentialTransfers(40),
    ]);

    const transactions: LiveTransaction[] = [...shieldTxs, ...confidentialTxs];

    return NextResponse.json(
      { transactions, wrapperContracts, fetchedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg, transactions: [], wrapperContracts: [] }, { status: 503 });
  }
}
