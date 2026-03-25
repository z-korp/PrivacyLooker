// PrivacyMode is always 'avec-zama' now — re-exported from store for backward compat
export type PrivacyMode = 'avec-zama';
export type DataMode = 'simulation' | 'live';

/**
 * wrap              = Shield: user encrypts tokens into the Zama wrapper contract
 * unwrap            = Unshield: user decrypts tokens out of the wrapper contract
 * confidential      = FHE transfer between two users (amount permanently encrypted)
 * transfer          = plain ERC-20 (mock/fallback)
 */
export type EventType = 'wrap' | 'unwrap' | 'confidential' | 'transfer';

/** A wallet address OR a Zama wrapper contract node */
export interface GraphNode {
  id: string;               // Ethereum address (lowercase)
  address: string;          // same as id
  label: string;            // short display label
  val: number;              // relative size for physics engine
  txCount: number;
  isHub: boolean;           // high-degree generic hub
  isWrapperContract: boolean; // true = Zama cToken wrapper contract
  isBaseToken?: boolean;    // true = plain ERC-20 counterpart of a wrapper (e.g. USDT node)
  tokenSymbol?: string;     // for wrapper + base-token nodes
  tvs?: number;             // Total Value Shielded in raw units (wrapper contracts only)
  /** Fixed 3D position — prevents the physics sim from moving these nodes */
  fx?: number;
  fy?: number;
  fz?: number;
}

/** A transaction edge (may represent multiple aggregated on-chain transactions) */
export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  txHash: string;
  token: string;            // displayed name (e.g. "cUSDC" in Avec Zama)
  tokenBase: string;        // base name (always "USDC")
  /**
   * The semantic transformation this edge represents:
   *   wrap          → "USDC → cUSDC"
   *   unwrap        → "cUSDC → USDC"
   *   confidential  → "cUSDC"
   */
  transformLabel: string;
  amount: number;           // raw amount of most recent txn (0 for confidential)
  amountFormatted: string;  // human readable OR "🔒 Encrypted"
  decimals: number;
  blockNumber?: number;
  eventType: EventType;
  isLive: boolean;
  curvature?: number;

  // ── Aggregation (multiple real txns collapsed into one visual edge) ──────
  aggregatedCount: number;       // 1 for single txns; >1 when aggregated
  txHashes: string[];            // all tx hashes (index 0 = most recent)
  blockNumbers: number[];        // corresponding block numbers
  totalAmount: number;           // sum of all raw amounts in this edge
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** Zama wrapper contract metadata (from registered_tokens table) */
export interface WrapperContract {
  wrapperAddress: string;   // the Zama contract address
  tokenAddress: string;     // the underlying ERC-20
  tokenSymbol: string;      // "USDT", "WETH", etc.
  tokenDecimals: number;
  tvs: number;              // total value shielded in raw token units
}

export interface LiveTransaction {
  txHash: string;
  from: string;
  to: string;
  token: string;
  transformLabel: string;   // "USDT → cUSDT", "cUSDT → USDT", "cUSDT"
  amount: number;
  amountFormatted: string;
  decimals: number;
  blockNumber: number;
  eventType: EventType;
}

/** One week's aggregated shield/unshield counts, broken down by token */
export interface TimelineWeek {
  weekStart: number;   // Unix timestamp of Monday 00:00 UTC
  weekEnd: number;     // Unix timestamp of Sunday 23:59:59 UTC
  weekLabel: string;   // "Dec 29", "Jan 5", etc.
  tokens: Record<string, { wrap: number; unwrap: number }>;
  total: { wrap: number; unwrap: number };
}

export interface TimelineData {
  weeks: TimelineWeek[];
  tokens: string[];    // distinct token symbols present in data
  totalFetched: number;
}

/** On-chain data provenance — proves the live graph is real, not mocked */
export interface DataProvenance {
  source: string;                // "zamadashboard.org · Supabase"
  supabaseUrl: string;           // the public Supabase project URL
  totalWrapEvents: number;       // total rows in wrapper_events table
  totalConfidential: number;     // total rows in confidential_transfers table
  blockRange: { min: number; max: number } | null;
  fetchedAt: string;             // ISO timestamp
}
