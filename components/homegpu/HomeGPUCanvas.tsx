'use client';

import { useRef, useEffect } from 'react';
import { useTransactions } from '@/hooks/useTransactions';
import type { HomeGPUScene as HomeGPUSceneT } from './HomeGPUScene';

export default function HomeGPUCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HomeGPUSceneT | null>(null);
  const { graphData, loading } = useTransactions();

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
      sceneRef.current = scene;
      await scene.init(el);
    })();

    return () => {
      cancelled = true;
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Push data updates into the scene
  useEffect(() => {
    if (sceneRef.current && graphData.nodes.length > 0) {
      sceneRef.current.updateData(graphData);
    }
  }, [graphData]);

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

  return (
    <div ref={containerRef} className="fixed inset-0 z-0" style={{ background: '#000000' }}>
      {(loading || graphData.nodes.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div
              className="w-12 h-12 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: '#FFD200', borderTopColor: 'transparent' }}
            />
            <p className="font-mono text-xs text-white/40 tracking-widest uppercase">
              Initialising WebGPU&hellip;
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
