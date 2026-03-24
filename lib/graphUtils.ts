import { GraphData, GraphLink, GraphNode, LiveTransaction, WrapperContract } from '@/types/graph';
import { truncateAddress, formatTokenAmount } from '@/lib/tokenConfig';

/**
 * Builds the force-graph data from live transactions.
 *
 * Wrapper contracts are pre-seeded as large, identifiable central hub nodes.
 * Their val is set proportionally to TVS so the most active contracts appear biggest.
 *
 * Multiple transactions between the same (source → target) pair and same eventType
 * are collapsed into a single aggregated edge — keeps the graph readable even with
 * thousands of on-chain events.
 */
export function buildGraphData(
  transactions: LiveTransaction[],
  wrapperContracts: WrapperContract[] = []
): GraphData {
  const nodeMap = new Map<string, GraphNode>();

  // ── Pre-seed wrapper contract nodes (pinned in a ring) ──────────────────
  const maxTvs = wrapperContracts.reduce((m, w) => Math.max(m, w.tvs), 1);
  // Sort alphabetically so positions are deterministic regardless of API order
  const sortedContracts = [...wrapperContracts].sort((a, b) =>
    a.tokenSymbol.localeCompare(b.tokenSymbol)
  );
  const RING_R = 220;
  const n = sortedContracts.length;

  for (let wi = 0; wi < n; wi++) {
    const wc = sortedContracts[wi];
    const key = wc.wrapperAddress.toLowerCase();
    const angle = (wi / n) * Math.PI * 2;
    nodeMap.set(key, {
      id: key,
      address: wc.wrapperAddress,
      label: `c${wc.tokenSymbol}`,
      val: 6 + Math.round((wc.tvs / maxTvs) * 6),
      txCount: 0,
      isHub: true,
      isWrapperContract: true,
      tokenSymbol: wc.tokenSymbol,
      tvs: wc.tvs,
      // Fixed 3D position — physics sim will not move these
      fx: RING_R * Math.cos(angle),
      fy: RING_R * Math.sin(angle) * 0.55,
      fz: (wi % 2 === 0 ? 1 : -1) * 35,
    });
  }

  // ── Create / update wallet nodes ─────────────────────────────────────────
  const getOrCreate = (address: string): GraphNode => {
    const key = address.toLowerCase();
    if (!nodeMap.has(key)) {
      nodeMap.set(key, {
        id: key,
        address,
        label: truncateAddress(address),
        val: 1,
        txCount: 0,
        isHub: false,
        isWrapperContract: false,
      });
    }
    return nodeMap.get(key)!;
  };

  // ── Accumulate per-pair buckets before building links ─────────────────────
  // Key: `${sourceKey}__${targetKey}__${eventType}__${token}`
  // Including token in the key so USDT Shield and USDC Shield are separate edges
  interface Bucket {
    from: GraphNode;
    to: GraphNode;
    txHashesArr: string[];
    blockNumbersArr: number[];
    amountTotal: number;
    latestTx: LiveTransaction; // first in list = most recent (txns arrive desc ordered)
  }
  const buckets = new Map<string, Bucket>();

  for (const tx of transactions) {
    const from = getOrCreate(tx.from);
    const to   = getOrCreate(tx.to);

    from.txCount++;
    to.txCount++;

    // Don't resize wrapper contracts — their size is TVS-driven
    if (!from.isWrapperContract) from.val = Math.min(1 + Math.floor(from.txCount / 2), 5);
    if (!to.isWrapperContract)   to.val   = Math.min(1 + Math.floor(to.txCount / 2), 5);

    const bucketKey = `${from.id}__${to.id}__${tx.eventType}__${tx.token}`;
    const existing = buckets.get(bucketKey);

    if (existing) {
      existing.txHashesArr.push(tx.txHash);
      existing.blockNumbersArr.push(tx.blockNumber);
      existing.amountTotal += tx.amount;
    } else {
      buckets.set(bucketKey, {
        from,
        to,
        txHashesArr: [tx.txHash],
        blockNumbersArr: [tx.blockNumber],
        amountTotal: tx.amount,
        latestTx: tx,
      });
    }
  }

  // ── Build aggregated links ────────────────────────────────────────────────
  const links: GraphLink[] = [];

  for (const b of buckets.values()) {
    const tx = b.latestTx;
    const count = b.txHashesArr.length;
    const isConf = tx.eventType === 'confidential';

    // For aggregated shield/unshield: show total volume across all txns
    const totalAmountFormatted = isConf
      ? '🔒 Encrypted'
      : count === 1
        ? tx.amountFormatted
        : formatTokenAmount(b.amountTotal, tx.decimals);

    links.push({
      source: b.from.id,
      target: b.to.id,
      txHash: b.txHashesArr[0],          // most recent tx hash
      token: tx.token,
      tokenBase: tx.token,
      transformLabel: tx.transformLabel,
      amount: tx.amount,                  // most recent individual amount
      amountFormatted: totalAmountFormatted,
      decimals: tx.decimals,
      blockNumber: b.blockNumbersArr[0],  // most recent block
      eventType: tx.eventType,
      isLive: true,
      curvature: tx.eventType === 'confidential' ? 0.3 : 0.1,
      // Aggregation fields
      aggregatedCount: count,
      txHashes: b.txHashesArr,
      blockNumbers: b.blockNumbersArr,
      totalAmount: b.amountTotal,
    });
  }

  // ── Mark high-degree wallet nodes as generic hubs ─────────────────────────
  const walletNodes = Array.from(nodeMap.values()).filter((node) => !node.isWrapperContract);
  const avgDegree = walletNodes.length > 0 ? (links.length * 2) / walletNodes.length : 0;
  walletNodes.forEach((node) => {
    if (node.txCount > avgDegree * 2) {
      node.isHub = true;
      node.val = Math.min(node.val + 1, 5);
    }
  });

  return { nodes: Array.from(nodeMap.values()), links };
}
