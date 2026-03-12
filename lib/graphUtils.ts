import { GraphData, GraphLink, GraphNode, LiveTransaction, WrapperContract } from '@/types/graph';
import { truncateAddress, formatTokenAmount } from '@/lib/tokenConfig';

/**
 * Builds the force-graph data from live transactions.
 *
 * Wrapper contracts are pre-seeded as large, identifiable central hub nodes.
 * Their val is set proportionally to TVS so the most active contracts appear biggest.
 */
export function buildGraphData(
  transactions: LiveTransaction[],
  wrapperContracts: WrapperContract[] = []
): GraphData {
  const nodeMap = new Map<string, GraphNode>();

  // ── Pre-seed wrapper contract nodes ─────────────────────────────────────
  // Compute max TVS for relative sizing
  const maxTvs = wrapperContracts.reduce((m, w) => Math.max(m, w.tvs), 1);

  for (const wc of wrapperContracts) {
    const key = wc.wrapperAddress.toLowerCase();
    nodeMap.set(key, {
      id: key,
      address: wc.wrapperAddress,
      label: `c${wc.tokenSymbol}`,        // "cUSDT", "cWETH", etc.
      val: 6 + Math.round((wc.tvs / maxTvs) * 6),  // 6–12 range
      txCount: 0,
      isHub: true,
      isWrapperContract: true,
      tokenSymbol: wc.tokenSymbol,
      tvs: wc.tvs,
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

  // ── Build links ───────────────────────────────────────────────────────────
  const links: GraphLink[] = [];

  for (const tx of transactions) {
    const from = getOrCreate(tx.from);
    const to = getOrCreate(tx.to);

    from.txCount++;
    to.txCount++;

    // Don't resize wrapper contracts — their size is TVS-driven
    if (!from.isWrapperContract) from.val = Math.min(1 + Math.floor(from.txCount / 2), 5);
    if (!to.isWrapperContract) to.val = Math.min(1 + Math.floor(to.txCount / 2), 5);

    links.push({
      source: tx.from.toLowerCase(),
      target: tx.to.toLowerCase(),
      txHash: tx.txHash,
      token: tx.token,
      tokenBase: tx.token,
      amount: tx.amount,
      amountFormatted: tx.amountFormatted,
      decimals: tx.decimals,
      blockNumber: tx.blockNumber,
      eventType: tx.eventType,
      isLive: true,
      curvature: tx.eventType === 'confidential' ? 0.3 : 0.1,
    });
  }

  // ── Mark high-degree wallet nodes as generic hubs ─────────────────────────
  const walletNodes = Array.from(nodeMap.values()).filter((n) => !n.isWrapperContract);
  const avgDegree = walletNodes.length > 0 ? (links.length * 2) / walletNodes.length : 0;
  walletNodes.forEach((n) => {
    if (n.txCount > avgDegree * 2) {
      n.isHub = true;
      n.val = Math.min(n.val + 1, 5);
    }
  });

  return { nodes: Array.from(nodeMap.values()), links };
}
