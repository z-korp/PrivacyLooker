'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GraphData, LiveTransaction, WrapperContract, DataProvenance } from '@/types/graph';
import { buildGraphData } from '@/lib/graphUtils';
import { useAppStore, LiveStats } from '@/store/appStore';

/** Debounce delay (ms) before re-fetching on filter changes */
const DEBOUNCE_MS = 300;

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

  // Raw API response — graph is derived via useMemo
  const [rawData, setRawData] = useState<{
    transactions: LiveTransaction[];
    wrapperContracts: WrapperContract[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef             = useRef(true);
  const debounceRef            = useRef<ReturnType<typeof setTimeout>>();

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
        transactions: LiveTransaction[];
        wrapperContracts: WrapperContract[];
        provenance: DataProvenance | null;
        error?: string;
      } = await res.json();

      if (!mountedRef.current) return;

      setRawData({
        transactions: data.transactions ?? [],
        wrapperContracts: data.wrapperContracts ?? [],
      });
      setProvenance(data.provenance ?? null);
      setDataError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setDataError(`Live fetch failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      if (mountedRef.current) { setLiveLoading(false); setLoading(false); }
    }
  }, [setLiveLoading, setProvenance, setDataError, selectedWeek, selectedToken]);

  // Memoize graph construction — only rebuilds when raw API data changes
  const graphData = useMemo<GraphData>(() => {
    if (!rawData) return { nodes: [], links: [] };
    return buildGraphData(rawData.transactions, rawData.wrapperContracts);
  }, [rawData]);

  // Push derived stats into the store whenever graphData changes
  useEffect(() => {
    if (!rawData) return;
    setStats(graphData.nodes.length, graphData.links.length);
    setLiveStats(computeStats(graphData));
  }, [graphData, rawData, setStats, setLiveStats]);

  // Debounced re-fetch when filters change
  useEffect(() => {
    mountedRef.current = true;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchLive, DEBOUNCE_MS);
    return () => {
      mountedRef.current = false;
      clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek, selectedToken]);

  return { graphData, loading };
}
