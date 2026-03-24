'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { GraphData, WrapperContract, DataProvenance } from '@/types/graph';
import { generateMockData, appendMockTransactions } from '@/lib/mockGenerator';
import { buildGraphData } from '@/lib/graphUtils';
import { useAppStore } from '@/store/appStore';

const SIMULATION_REFRESH_MS = 8_000;
const LIVE_REFRESH_MS = 30_000;

export interface UseTransactionsResult {
  graphData: GraphData;
  loading: boolean;
}

export function useTransactions(): UseTransactionsResult {
  const dataMode = useAppStore((s) => s.dataMode);
  const setStats = useAppStore((s) => s.setStats);
  const setLiveLoading = useAppStore((s) => s.setLiveLoading);
  const setDataError = useAppStore((s) => s.setDataError);
  const setProvenance = useAppStore((s) => s.setProvenance);

  const [graphData, setGraphData] = useState<GraphData>(() => generateMockData());
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ── Simulation mode ────────────────────────────────────────────────────────
  const startSimulation = useCallback(() => {
    const initial = generateMockData(Date.now());
    setGraphData(initial);
    setStats(initial.nodes.length, initial.links.length);
    setProvenance(null);
    setDataError(null);

    intervalRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      setGraphData((prev) => {
        const next = appendMockTransactions(prev, 4, Date.now());
        setStats(next.nodes.length, next.links.length);
        return next;
      });
    }, SIMULATION_REFRESH_MS);
  }, [setStats, setProvenance, setDataError]);

  // ── Live mode ──────────────────────────────────────────────────────────────
  const fetchLive = useCallback(async () => {
    if (!mountedRef.current) return;
    setLiveLoading(true);
    try {
      const res = await fetch('/api/live-transactions');
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
      setProvenance(data.provenance ?? null);
      setDataError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setDataError(`Live fetch failed: ${msg}`);
    } finally {
      if (mountedRef.current) setLiveLoading(false);
    }
  }, [setStats, setProvenance, setLiveLoading, setDataError]);

  const startLive = useCallback(() => {
    fetchLive();
    intervalRef.current = setInterval(fetchLive, LIVE_REFRESH_MS);
  }, [fetchLive]);

  // ── Mode switching ─────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    clearTimer();
    setLoading(true);

    if (dataMode === 'simulation') {
      startSimulation();
    } else {
      startLive();
    }

    setLoading(false);
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [dataMode, startSimulation, startLive, clearTimer]);

  return { graphData, loading };
}
