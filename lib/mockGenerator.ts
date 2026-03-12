import { GraphData, GraphNode, GraphLink, EventType } from '@/types/graph';
import { TOKENS, truncateAddress, formatTokenAmount } from '@/lib/tokenConfig';

const NODE_COUNT = 43;   // wallet nodes (50 total with 7 wrapper contracts below)
const EDGE_COUNT = 110;  // includes confidential transfers

// Mock Zama wrapper contract nodes — one per token, fixed addresses
const MOCK_WRAPPER_CONTRACTS: Array<{ address: string; tokenSymbol: string; tvs: number }> = [
  { address: '0xae0207c757aa2b4019ad96edd0092ddc63ef0c50', tokenSymbol: 'USDT',  tvs: 36_176_143_185_659 },
  { address: '0xe978f22157048e5db8e5d07971376e86671672b2', tokenSymbol: 'USDC',  tvs: 97_853_341_080 },
  { address: '0xda9396b82634ea99243ce51258b6a5ae512d4893', tokenSymbol: 'WETH',  tvs: 70_236 },
  { address: '0x85de671c3bec1aded752c3cea943521181c826bc', tokenSymbol: 'BRON',  tvs: 5_320_891_060_000 },
  { address: '0x80cb147fd86dc6dee3eee7e4cee33d1397d98071', tokenSymbol: 'ZAMA',  tvs: 81_983_515_440 },
  { address: '0xa873750ccbafD5ec7dd13bfd5237d7129832edD9', tokenSymbol: 'tGBP',  tvs: 1_013_741_844_686 },
  { address: '0x73cc9af9d6befdb3c3faf8a5e8c05cb95fdaeef1', tokenSymbol: 'XAUt',  tvs: 20_104 },
];

/** Deterministic-ish seeded pseudo-random (not cryptographic) */
function seededRandom(seed: number): () => number {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function randomAddress(rng: () => number): string {
  const hex = '0123456789abcdef';
  let addr = '0x';
  for (let i = 0; i < 40; i++) {
    addr += hex[Math.floor(rng() * 16)];
  }
  return addr;
}

let cachedData: GraphData | null = null;
let lastSeed = -1;

/**
 * Generates mock graph data for Simulation mode.
 * Calling this twice with the same seed returns identical data.
 * Pass a new seed to get fresh transactions (nodes stay stable).
 */
export function generateMockData(txSeed = 42): GraphData {
  // Re-use existing nodes if they exist; only regenerate edges
  const nodeSeed = 1337;
  const nodeRng = seededRandom(nodeSeed);
  const txRng = seededRandom(txSeed);

  const nodes: GraphNode[] = [];
  const addressPool: string[] = [];

  // ── Pre-seed Zama wrapper contract nodes ─────────────────────────────────
  const maxTvs = Math.max(...MOCK_WRAPPER_CONTRACTS.map((w) => w.tvs));
  for (const wc of MOCK_WRAPPER_CONTRACTS) {
    nodes.push({
      id: wc.address,
      address: wc.address,
      label: `c${wc.tokenSymbol}`,
      val: 6 + Math.round((wc.tvs / maxTvs) * 6),
      txCount: 0,
      isHub: true,
      isWrapperContract: true,
      tokenSymbol: wc.tokenSymbol,
      tvs: wc.tvs,
    });
    addressPool.push(wc.address);
  }

  // ── Regular wallet nodes ──────────────────────────────────────────────────
  for (let i = 0; i < NODE_COUNT; i++) {
    const address = randomAddress(nodeRng);
    addressPool.push(address);
    nodes.push({
      id: address,
      address,
      label: truncateAddress(address),
      val: 1 + Math.floor(nodeRng() * 3),
      txCount: 0,
      isHub: false,
      isWrapperContract: false,
    });
  }

  const links: GraphLink[] = [];
  const wrapperCount = MOCK_WRAPPER_CONTRACTS.length;
  // Wallet nodes start at index `wrapperCount` in addressPool
  const walletStartIdx = wrapperCount;
  const walletCount = NODE_COUNT;
  const totalNodes = nodes.length;

  const mockHash = () => `0x${Array.from({ length: 64 }, () =>
    '0123456789abcdef'[Math.floor(txRng() * 16)]
  ).join('')}`;

  for (let i = 0; i < EDGE_COUNT; i++) {
    const roll = txRng();
    let fromIdx: number;
    let toIdx: number;
    let eventType: EventType;

    if (roll < 0.40) {
      // Shield: wallet → wrapper contract
      const wrapperIdx = Math.floor(txRng() * wrapperCount);
      const walletIdx  = walletStartIdx + Math.floor(txRng() * walletCount);
      fromIdx   = walletIdx;
      toIdx     = wrapperIdx;
      eventType = 'wrap';
    } else if (roll < 0.75) {
      // Unshield: wrapper contract → wallet
      const wrapperIdx = Math.floor(txRng() * wrapperCount);
      const walletIdx  = walletStartIdx + Math.floor(txRng() * walletCount);
      fromIdx   = wrapperIdx;
      toIdx     = walletIdx;
      eventType = 'unwrap';
    } else {
      // Confidential transfer: wallet → wallet (different)
      fromIdx   = walletStartIdx + Math.floor(txRng() * walletCount);
      toIdx     = walletStartIdx + Math.floor(txRng() * walletCount);
      if (toIdx === fromIdx) toIdx = walletStartIdx + ((fromIdx - walletStartIdx + 1) % walletCount);
      eventType = 'confidential';
    }

    if (fromIdx === toIdx || fromIdx >= totalNodes || toIdx >= totalNodes) continue;

    // Pick token matching the wrapper contract when applicable
    const wrapperNode = eventType !== 'confidential'
      ? nodes[eventType === 'wrap' ? toIdx : fromIdx]
      : null;
    const token = wrapperNode?.isWrapperContract
      ? TOKENS.find((t) => t.symbol === wrapperNode.tokenSymbol) ?? TOKENS[0]
      : TOKENS[Math.floor(txRng() * TOKENS.length)];

    const rawAmount = eventType === 'confidential'
      ? 0
      : Math.floor(txRng() * 9_000_000 * Math.pow(10, token.decimals));

    nodes[fromIdx].txCount++;
    nodes[toIdx].txCount++;

    links.push({
      source: addressPool[fromIdx],
      target: addressPool[toIdx],
      txHash: mockHash(),
      token: token.symbol,
      tokenBase: token.symbol,
      amount: rawAmount,
      amountFormatted: eventType === 'confidential' ? '🔒 Encrypted' : formatTokenAmount(rawAmount, token.decimals),
      decimals: token.decimals,
      eventType,
      isLive: false,
      curvature: eventType === 'confidential' ? 0.35 : 0.1,
    });
  }

  // Wallet hubs (don't resize wrapper contracts)
  const avgDegree = links.length / nodes.length;
  nodes.forEach((n) => {
    if (!n.isWrapperContract) {
      n.isHub = n.txCount > avgDegree * 1.8;
      if (n.isHub) n.val = Math.min(n.val + 2, 5);
    }
  });

  cachedData = { nodes, links };
  lastSeed = txSeed;
  return cachedData;
}

/** Add a small batch of new transactions to an existing graph (for live animation) */
export function appendMockTransactions(
  existing: GraphData,
  count = 5,
  seed = Date.now()
): GraphData {
  const rng = seededRandom(seed);
  const nodes = [...existing.nodes];
  const links = [...existing.links];
  const addressPool = nodes.map((n) => n.address);

  const wrapperIdxs = nodes
    .map((n, i) => (n.isWrapperContract ? i : -1))
    .filter((i) => i >= 0);
  const walletIdxs = nodes
    .map((n, i) => (!n.isWrapperContract ? i : -1))
    .filter((i) => i >= 0);

  const rHash = () => `0x${Array.from({ length: 64 }, () =>
    '0123456789abcdef'[Math.floor(rng() * 16)]
  ).join('')}`;

  for (let i = 0; i < count; i++) {
    const roll = rng();
    let fromIdx: number;
    let toIdx: number;
    let eventType: EventType;

    if (roll < 0.40 && wrapperIdxs.length && walletIdxs.length) {
      // Shield
      fromIdx   = walletIdxs[Math.floor(rng() * walletIdxs.length)];
      toIdx     = wrapperIdxs[Math.floor(rng() * wrapperIdxs.length)];
      eventType = 'wrap';
    } else if (roll < 0.75 && wrapperIdxs.length && walletIdxs.length) {
      // Unshield
      fromIdx   = wrapperIdxs[Math.floor(rng() * wrapperIdxs.length)];
      toIdx     = walletIdxs[Math.floor(rng() * walletIdxs.length)];
      eventType = 'unwrap';
    } else if (walletIdxs.length >= 2) {
      // Confidential transfer
      fromIdx   = walletIdxs[Math.floor(rng() * walletIdxs.length)];
      toIdx     = walletIdxs[Math.floor(rng() * walletIdxs.length)];
      if (toIdx === fromIdx) toIdx = walletIdxs[(walletIdxs.indexOf(fromIdx) + 1) % walletIdxs.length];
      eventType = 'confidential';
    } else continue;

    const wrapperNode = eventType !== 'confidential'
      ? nodes[eventType === 'wrap' ? toIdx : fromIdx]
      : null;
    const token = wrapperNode?.isWrapperContract
      ? TOKENS.find((t) => t.symbol === wrapperNode.tokenSymbol) ?? TOKENS[0]
      : TOKENS[Math.floor(rng() * TOKENS.length)];

    const rawAmount = eventType === 'confidential' ? 0
      : Math.floor(rng() * 5_000_000 * Math.pow(10, token.decimals));

    links.push({
      source: addressPool[fromIdx],
      target: addressPool[toIdx],
      txHash: rHash(),
      token: token.symbol,
      tokenBase: token.symbol,
      amount: rawAmount,
      amountFormatted: eventType === 'confidential' ? '🔒 Encrypted' : formatTokenAmount(rawAmount, token.decimals),
      decimals: token.decimals,
      eventType,
      isLive: false,
      curvature: eventType === 'confidential' ? 0.35 : 0.1,
    });
  }

  // Keep link count reasonable
  const maxLinks = EDGE_COUNT + 30;
  return {
    nodes,
    links: links.length > maxLinks ? links.slice(links.length - maxLinks) : links,
  };
}
