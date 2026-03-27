'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTransactions } from '@/hooks/useTransactions';
import { useAppStore } from '@/store/appStore';
import type { HomeGPUScene as HomeGPUSceneT } from './HomeGPUScene';
import type { GraphNode, GraphLink } from '@/types/graph';

export default function HomeGPUCanvas({
  onReady,
  focusedNodeId = null,
}: {
  onReady?: () => void;
  focusedNodeId?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HomeGPUSceneT | null>(null);
  const { graphData, loading } = useTransactions();
  const isLiveLoading = useAppStore((s) => s.isLiveLoading);

  const [sceneReady, setSceneReady] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  const setSelectedNode = useAppStore((s) => s.setSelectedNode);
  const setSelectedLink = useAppStore((s) => s.setSelectedLink);

  const onSelectNode = useCallback(
    (node: GraphNode | null) => setSelectedNode(node),
    [setSelectedNode],
  );
  const onSelectLink = useCallback(
    (link: GraphLink | null) => setSelectedLink(link),
    [setSelectedLink],
  );

  // Mount / unmount the WebGPU scene
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let scene: HomeGPUSceneT | null = null;
    let cancelled = false;

    (async () => {
      const { HomeGPUScene } = await import('./HomeGPUScene');
      if (cancelled) return;

      scene = new HomeGPUScene();
      scene.setCallbacks({ onSelectNode, onSelectLink });
      sceneRef.current = scene;
      await scene.init(el);
      if (!cancelled) setSceneReady(true);
    })();

    return () => {
      cancelled = true;
      scene?.dispose();
      sceneRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep callbacks fresh if store selectors change
  useEffect(() => {
    sceneRef.current?.setCallbacks({ onSelectNode, onSelectLink });
  }, [onSelectNode, onSelectLink]);

  // Push data updates into the scene
  useEffect(() => {
    if (sceneRef.current && graphData.nodes.length > 0) {
      sceneRef.current.updateData(graphData);
      if (!dataLoaded) setDataLoaded(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData]);

  // Focus on a specific node when requested by parent
  useEffect(() => {
    if (sceneRef.current && sceneReady) {
      sceneRef.current.focusOnNode(focusedNodeId);
    }
  }, [focusedNodeId, sceneReady]);

  // Notify parent when fully ready
  useEffect(() => {
    if (sceneReady && dataLoaded) onReady?.();
  }, [sceneReady, dataLoaded, onReady]);

  // Window resize
  useEffect(() => {
    function onResize() {
      if (!containerRef.current || !sceneRef.current) return;
      sceneRef.current.resize(
        containerRef.current.clientWidth,
        containerRef.current.clientHeight,
      );
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Show overlay only after initial load (period/token re-fetch)
  const showOverlayLoading = dataLoaded && isLiveLoading;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-0 transition-opacity duration-300"
      style={{
        background: '#000000',
        opacity: showOverlayLoading ? 0.5 : 1,
      }}
    >
      {/* Overlay loading bar for period/token changes */}
      <AnimatePresence>
        {showOverlayLoading && (
          <motion.div
            className="absolute top-0 left-0 right-0 z-50 h-0.5 overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{
                background: 'linear-gradient(90deg, transparent, #FFD200, transparent)',
              }}
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay spinner badge for period/token changes */}
      <AnimatePresence>
        {showOverlayLoading && (
          <motion.div
            className="absolute top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-lg border"
            style={{
              borderColor: 'rgba(255,210,0,0.25)',
              backgroundColor: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(8px)',
            }}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <div
              className="w-3.5 h-3.5 border-[1.5px] border-t-transparent rounded-full animate-spin"
              style={{ borderColor: '#FFD200', borderTopColor: 'transparent' }}
            />
            <span className="font-mono text-[9px] tracking-wider uppercase" style={{ color: '#FFD200' }}>
              Updating&hellip;
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
