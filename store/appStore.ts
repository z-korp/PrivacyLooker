'use client';

import { create } from 'zustand';
import { PrivacyMode, DataMode, GraphNode, GraphLink, DataProvenance } from '@/types/graph';

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
  // ForceGraph3D instance — shared for GIF capture
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fgInstance: any | null;

  setPrivacyMode: (mode: PrivacyMode) => void;
  setDataMode: (mode: DataMode) => void;
  setSelectedNode: (node: GraphNode | null) => void;
  setSelectedLink: (link: GraphLink | null) => void;
  setStats: (nodes: number, links: number, updated?: Date) => void;
  setLiveLoading: (loading: boolean) => void;
  setDataError: (error: string | null) => void;
  setProvenance: (p: DataProvenance | null) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setFgInstance: (instance: any | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  privacyMode: 'sans-zama',
  dataMode: 'simulation',
  selectedNode: null,
  selectedLink: null,
  nodeCount: 0,
  linkCount: 0,
  lastUpdated: null,
  isLiveLoading: false,
  dataError: null,
  provenance: null,
  fgInstance: null,

  setPrivacyMode: (mode) => set({ privacyMode: mode, selectedNode: null, selectedLink: null }),
  setDataMode: (mode) => set({ dataMode: mode, selectedNode: null, selectedLink: null }),
  setSelectedNode: (node) => set({ selectedNode: node, selectedLink: null }),
  setSelectedLink: (link) => set({ selectedLink: link, selectedNode: null }),
  setStats: (nodes, links, updated) =>
    set({ nodeCount: nodes, linkCount: links, lastUpdated: updated ?? new Date() }),
  setLiveLoading: (loading) => set({ isLiveLoading: loading }),
  setDataError: (error) => set({ dataError: error }),
  setProvenance: (p) => set({ provenance: p }),
  setFgInstance: (instance) => set({ fgInstance: instance }),
}));
