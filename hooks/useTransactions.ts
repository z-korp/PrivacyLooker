'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { GraphData, WrapperContract, DataProvenance } from '@/types/graph';
import { buildGraphData } from '@/lib/graphUtils';
import { useAppStore, LiveStats } from '@/store/appStore';

export interface UseTransactionsResult {
  graphData: GraphData;
  loading: boolean;
}

/** Derive LiveStats from graph nodes + links */
function computeStats(graph: GraphData): LiveStats {
  const shieldCount   = graph.links.filter((l) => l.eventType === 'wrap')
    .reduce((s, l) => s + (l.aggregatedCount ?? 1), 0);
  const unshieldCount = graph.links.filter((l) => l.eventType === 'unwrap')
    .reduce((s, l) => s + (l.aggregatedCount ?? 1), 0);
  const confCount     = graph.links.filter((l) => l.eventType === 'confidential')
    .reduce((s, l) => s + (l.aggregatedCount ?? 1), 0);

  const tvsByToken = graph.nodes
    .filter((n) => n.isWrapperContract && n.tvs != null && n.tvs > 0)
    .map((n) => ({
      symbol:   n.tokenSymbol ?? '?',
      tvs:      n.tvs!,
      decimals: ['WETH', 'BRON', 'tGBP'].includes(n.tokenSymbol ?? '') ? 18 : 6,
    }))
    .sort((a, b) => b.tvs - a.tvs);

  return { shieldCount, unshieldCount, confCount, totalEvents: shieldCount + unshieldCount + confCount, tvsByToken };
}

export function useTransactions(): UseTransactionsResult {
  const setStats        = useAppStore((s) => s.setStats);
  const setLiveLoading  = useAppStore((s) => s.setLiveLoading);
  const setDataError    = useAppStore((s) => s.setDataError);
  const setProvenance   = useAppStore((s) => s.setProvenance);
  const setLiveStats    = useAppStore((s) => s.setLiveStats);
  const selectedWeek    = useAppStore((s) => s.selectedWeek);
  const selectedToken   = useAppStore((s) => s.selectedTimelineToken);

  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading]     = useState(true);
  const mountedRef                = useRef(true);

  const fetchLive = useCallback(async () => {
    if (!mountedRef.current) return;
    setLiveLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedWeek) {
        params.set('from', String(selectedWeek.weekStart));
        params.set('to',   String(selectedWeek.weekEnd));
      }
      if (selectedToken && selectedToken !== 'ALL') {
        params.set('token', selectedToken);
      }
      const url = `/api/live-transactions${params.size ? `?${params}` : ''}`;
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
      const data: {
        transactions: Parameters<typeof buildGraphData>[0];
        wrapperContracts: WrapperContract[];
        provenance: DataProvenance | null;
        error?: string;
      } = await res.json();

      if (!mountedRef.current) return;

      const graph = buildGraphData(data.transactions ?? [], data.wrapperContracts ?? []);
      setGraphData(graph);
      setStats(graph.nodes.length, graph.links.length);
      setLiveStats(computeStats(graph));
      setProvenance(data.provenance ?? null);
      setDataError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setDataError(`Live fetch failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      if (mountedRef.current) { setLiveLoading(false); setLoading(false); }
    }
  }, [setStats, setLiveStats, setLiveLoading, setProvenance, setDataError, selectedWeek, selectedToken]);

  // Re-fetch only when the week or token filter changes
  useEffect(() => {
    mountedRef.current = true;
    fetchLive();
    return () => { mountedRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek, selectedToken]);

  return { graphData, loading };
}
