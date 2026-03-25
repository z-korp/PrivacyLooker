'use client';

import { create } from 'zustand';
import { DataMode, GraphNode, GraphLink, DataProvenance, TimelineWeek } from '@/types/graph';

// PrivacyMode is now always 'avec-zama' — FHE mode is permanently active
export type PrivacyMode = 'avec-zama';

export interface LiveStats {
  shieldCount: number;       // aggregated shield txns in current view
  unshieldCount: number;     // aggregated unshield txns
  confCount: number;         // aggregated confidential transfers
  totalEvents: number;
  // TVS per wrapper contract (raw units + decimals for formatting)
  tvsByToken: { symbol: string; tvs: number; decimals: number }[];
}

interface AppState {
  privacyMode: PrivacyMode;
  dataMode: DataMode;
  selectedNode: GraphNode | null;
  selectedLink: GraphLink | null;
  nodeCount: number;
  linkCount: number;
  lastUpdated: Date | null;
  isLiveLoading: boolean;
  dataError: string | null;
  provenance: DataProvenance | null;
  liveStats: LiveStats | null;
  selectedWeek: TimelineWeek | null;
  selectedTimelineToken: string;        // 'ALL' or token symbol
  // ForceGraph3D instance — shared for GIF capture
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fgInstance: any | null;

  setDataMode: (mode: DataMode) => void;
  setSelectedNode: (node: GraphNode | null) => void;
  setSelectedLink: (link: GraphLink | null) => void;
  setStats: (nodes: number, links: number, updated?: Date) => void;
  setLiveLoading: (loading: boolean) => void;
  setDataError: (error: string | null) => void;
  setProvenance: (p: DataProvenance | null) => void;
  setLiveStats: (s: LiveStats | null) => void;
  setSelectedWeek: (w: TimelineWeek | null) => void;
  setSelectedTimelineToken: (t: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setFgInstance: (instance: any | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  privacyMode: 'avec-zama',     // always FHE mode
  dataMode: 'live',
  selectedNode: null,
  selectedLink: null,
  nodeCount: 0,
  linkCount: 0,
  lastUpdated: null,
  isLiveLoading: false,
  dataError: null,
  provenance: null,
  liveStats: null,
  selectedWeek: null,
  selectedTimelineToken: 'ALL',
  fgInstance: null,

  setDataMode: (mode) => set({ dataMode: mode, selectedNode: null, selectedLink: null }),
  setSelectedNode: (node) => set({ selectedNode: node, selectedLink: null }),
  setSelectedLink: (link) => set({ selectedLink: link, selectedNode: null }),
  setStats: (nodes, links, updated) =>
    set({ nodeCount: nodes, linkCount: links, lastUpdated: updated ?? new Date() }),
  setLiveLoading: (loading) => set({ isLiveLoading: loading }),
  setDataError: (error) => set({ dataError: error }),
  setProvenance: (p) => set({ provenance: p }),
  setLiveStats: (s) => set({ liveStats: s }),
  setSelectedWeek: (w) => set({ selectedWeek: w }),
  setSelectedTimelineToken: (t) => set({ selectedTimelineToken: t }),
  setFgInstance: (instance) => set({ fgInstance: instance }),
}));
