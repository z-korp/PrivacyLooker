import { GraphData, GraphLink, GraphNode, LiveTransaction, WrapperContract } from '@/types/graph';
import { formatTokenAmount } from '@/lib/tokenConfig';

/** Maximum wallet nodes to keep (by txCount descending). */
const MAX_WALLET_NODES = 50;

/**
 * Builds the force-graph data for the organic "web of transactions" view.
 *
 * Topology
 * ─────────
 *   • One hub node per Zama wrapper contract (cUSDT, cUSDC …)
 *   • Up to MAX_WALLET_NODES wallet nodes (top by txCount, min 2 txns)
 *   • One **aggregated** edge per unique source→target pair
 *       (multiple on-chain txns between the same wallet↔wrapper are merged)
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
      val:              10 + Math.round((wc.tvs / maxTvs) * 10),
      txCount:          0,
      isHub:            true,
      isWrapperContract: true,
      isBaseToken:      false,
      tokenSymbol:      wc.tokenSymbol,
      tvs:              wc.tvs,
    });
  }

  // ── Pass 1: tally txCount per wallet & aggregate links by pair ────────────
  const walletTxCount = new Map<string, number>();

  // Key: "fromId::toId", Value: accumulated link data
  const linkAgg = new Map<string, {
    fromId: string;
    toId: string;
    token: string;
    transformLabel: string;
    decimals: number;
    eventType: LiveTransaction['eventType'];
    txHashes: string[];
    blockNumbers: number[];
    totalAmount: number;
  }>();

  for (const tx of transactions) {
    if (tx.eventType === 'confidential') continue;

    const wKey = tx.eventType === 'wrap' ? tx.to.toLowerCase() : tx.from.toLowerCase();
    if (!nodeMap.has(wKey)) continue;

    const walletAddr = tx.eventType === 'wrap' ? tx.from.toLowerCase() : tx.to.toLowerCase();
    walletTxCount.set(walletAddr, (walletTxCount.get(walletAddr) ?? 0) + 1);

    // Increment wrapper hub txCount
    nodeMap.get(wKey)!.txCount++;

    const fromId  = tx.eventType === 'wrap' ? walletAddr : wKey;
    const toId    = tx.eventType === 'wrap' ? wKey       : walletAddr;
    const pairKey = `${fromId}::${toId}`;

    const existing = linkAgg.get(pairKey);
    if (existing) {
      existing.txHashes.push(tx.txHash);
      existing.blockNumbers.push(tx.blockNumber);
      existing.totalAmount += tx.amount;
    } else {
      linkAgg.set(pairKey, {
        fromId,
        toId,
        token:          tx.token,
        transformLabel: tx.transformLabel,
        decimals:       tx.decimals,
        eventType:      tx.eventType,
        txHashes:       [tx.txHash],
        blockNumbers:   [tx.blockNumber],
        totalAmount:    tx.amount,
      });
    }
  }

  // ── Pass 2: select top wallets by txCount (min 2 txns) ────────────────────
  const topWallets = new Set(
    [...walletTxCount.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_WALLET_NODES)
      .map(([addr]) => addr)
  );

  // Create wallet nodes for selected wallets only
  for (const [addr, count] of walletTxCount) {
    if (!topWallets.has(addr)) continue;
    nodeMap.set(addr, {
      id:               addr,
      address:          addr,
      label:            addr.slice(0, 8) + '…',
      val:              1.5 + Math.min(count * 0.4, 5),
      txCount:          count,
      isHub:            false,
      isWrapperContract: false,
      isBaseToken:      false,
    });
  }

  // ── Pass 3: build aggregated links (only for kept wallets) ────────────────
  const links: GraphLink[] = [];

  for (const agg of linkAgg.values()) {
    // Skip links whose wallet node was pruned
    const walletId = nodeMap.has(agg.fromId) && !nodeMap.get(agg.fromId)!.isWrapperContract
      ? agg.fromId : agg.toId;
    if (!topWallets.has(walletId)) continue;

    const count = agg.txHashes.length;
    const latestIdx = agg.blockNumbers.reduce(
      (best, bn, i) => (bn > agg.blockNumbers[best] ? i : best), 0
    );

    links.push({
      source:          agg.fromId,
      target:          agg.toId,
      txHash:          agg.txHashes[latestIdx],
      token:           agg.token,
      tokenBase:       agg.token,
      transformLabel:  agg.transformLabel,
      amount:          agg.totalAmount,
      amountFormatted: agg.totalAmount > 0
        ? formatTokenAmount(agg.totalAmount, agg.decimals)
        : '0',
      decimals:        agg.decimals,
      blockNumber:     agg.blockNumbers[latestIdx],
      eventType:       agg.eventType,
      isLive:          true,
      curvature:       0.1,
      aggregatedCount: count,
      txHashes:        agg.txHashes,
      blockNumbers:    agg.blockNumbers,
      totalAmount:     agg.totalAmount,
    });
  }

  const nodes = Array.from(nodeMap.values()).filter((n) =>
    n.isWrapperContract || links.some((l) =>
      (typeof l.source === 'string' ? l.source : l.source.id) === n.id ||
      (typeof l.target === 'string' ? l.target : l.target.id) === n.id
    )
  );

  return { nodes, links };
}
