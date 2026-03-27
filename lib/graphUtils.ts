import { GraphData, GraphLink, GraphNode, LiveTransaction, WrapperContract } from '@/types/graph';

/**
 * Builds the force-graph data for the organic "web of transactions" view.
 *
 * Topology
 * ─────────
 *   • One hub node per Zama wrapper contract (cUSDT, cUSDC …)
 *   • One leaf node per unique wallet address seen in transactions
 *   • One directed edge per on-chain transaction
 *       Shield   → wallet ──► cTOKEN wrapper
 *       Unshield → cTOKEN wrapper ──► wallet
 *
 * No positions are fixed — the physics simulation spreads everything
 * organically into a web / star cluster around the wrapper hubs.
 *
 * Confidential transfers are excluded.
 */
export function buildGraphData(
  transactions: LiveTransaction[],
  wrapperContracts: WrapperContract[] = []
): GraphData {
  const nodeMap = new Map<string, GraphNode>();

  // ── Pre-seed wrapper hub nodes ────────────────────────────────────────────
  const maxTvs = wrapperContracts.reduce((m, w) => Math.max(m, w.tvs), 1);

  for (const wc of wrapperContracts) {
    const wKey = wc.wrapperAddress.toLowerCase();
    nodeMap.set(wKey, {
      id:               wKey,
      address:          wc.wrapperAddress,
      label:            `c${wc.tokenSymbol}`,
      val:              10 + Math.round((wc.tvs / maxTvs) * 10),  // large hub
      txCount:          0,
      isHub:            true,
      isWrapperContract: true,
      isBaseToken:      false,
      tokenSymbol:      wc.tokenSymbol,
      tvs:              wc.tvs,
    });
  }

  // ── One link + wallet node per transaction ────────────────────────────────
  const links: GraphLink[] = [];

  // Track curvature per wallet→wrapper pair (rare repeats get slight spread)
  const pairCount = new Map<string, number>();
  const pairIdx   = new Map<string, number>();

  // First pass: count per-pair so curvatures can be pre-distributed
  for (const tx of transactions) {
    if (tx.eventType === 'confidential') continue;
    const wKey      = tx.eventType === 'wrap' ? tx.to.toLowerCase() : tx.from.toLowerCase();
    if (!nodeMap.has(wKey)) continue;
    const walletKey = tx.eventType === 'wrap' ? tx.from.toLowerCase() : tx.to.toLowerCase();
    const fromId    = tx.eventType === 'wrap' ? walletKey : wKey;
    const toId      = tx.eventType === 'wrap' ? wKey      : walletKey;
    const pairKey   = `${fromId}::${toId}`;
    pairCount.set(pairKey, (pairCount.get(pairKey) ?? 0) + 1);
  }

  // Second pass: build nodes + links
  for (const tx of transactions) {
    if (tx.eventType === 'confidential') continue;

    const wKey = tx.eventType === 'wrap' ? tx.to.toLowerCase() : tx.from.toLowerCase();
    if (!nodeMap.has(wKey)) continue;

    const walletAddr = tx.eventType === 'wrap' ? tx.from.toLowerCase() : tx.to.toLowerCase();

    // Create wallet node on first encounter
    if (!nodeMap.has(walletAddr)) {
      nodeMap.set(walletAddr, {
        id:               walletAddr,
        address:          walletAddr,
        label:            walletAddr.slice(0, 8) + '…',
        val:              1.5,
        txCount:          0,
        isHub:            false,
        isWrapperContract: false,
        isBaseToken:      false,
      });
    }

    // Grow the wallet node slightly for repeat actors
    const walletNode = nodeMap.get(walletAddr)!;
    walletNode.txCount++;
    walletNode.val = 1.5 + Math.min(walletNode.txCount * 0.4, 5);

    nodeMap.get(wKey)!.txCount++;

    const fromId  = tx.eventType === 'wrap' ? walletAddr : wKey;
    const toId    = tx.eventType === 'wrap' ? wKey       : walletAddr;
    const pairKey = `${fromId}::${toId}`;
    const idx     = pairIdx.get(pairKey) ?? 0;
    pairIdx.set(pairKey, idx + 1);
    const total   = pairCount.get(pairKey) ?? 1;

    // Spread curvature for rare parallel edges (same wallet, multiple txns)
    const curvature = total === 1 ? 0.1 : 0.05 + (idx / (total - 1)) * 0.45;

    links.push({
      source:          fromId,
      target:          toId,
      txHash:          tx.txHash,
      token:           tx.token,
      tokenBase:       tx.token,
      transformLabel:  tx.transformLabel,
      amount:          tx.amount,
      amountFormatted: tx.amountFormatted,
      decimals:        tx.decimals,
      blockNumber:     tx.blockNumber,
      eventType:       tx.eventType,
      isLive:          true,
      curvature,
      aggregatedCount: 1,
      txHashes:        [tx.txHash],
      blockNumbers:    [tx.blockNumber],
      totalAmount:     tx.amount,
    });
  }

  const nodes = Array.from(nodeMap.values()).filter((n) =>
    // Keep wrapper hubs even if they have no links in this time-slice
    n.isWrapperContract || links.some((l) =>
      (typeof l.source === 'string' ? l.source : l.source.id) === n.id ||
      (typeof l.target === 'string' ? l.target : l.target.id) === n.id
    )
  );

  return { nodes, links };
}
