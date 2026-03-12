export type PrivacyMode = 'sans-zama' | 'avec-zama';
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
  tokenSymbol?: string;     // only for wrapper contracts: "USDT", "WETH", etc.
  tvs?: number;             // Total Value Shielded in USD (wrapper contracts only)
}

/** A transaction edge */
export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  txHash: string;
  token: string;            // displayed name (e.g. "cUSDC" in Avec Zama)
  tokenBase: string;        // base name (always "USDC")
  amount: number;           // raw amount (0 for confidential transfers)
  amountFormatted: string;  // human readable OR "🔒 Encrypted"
  decimals: number;
  blockNumber?: number;
  eventType: EventType;
  isLive: boolean;
  curvature?: number;
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
  amount: number;
  amountFormatted: string;
  decimals: number;
  blockNumber: number;
  eventType: EventType;
}
