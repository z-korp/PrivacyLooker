'use client';

import { Suspense, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { InfoPanel }           from '@/components/overlay/InfoPanel';
import { ErrorBanner }         from '@/components/overlay/ErrorBanner';
import { GifExporter }         from '@/components/overlay/GifExporter';
import { DataProvenanceBadge } from '@/components/overlay/DataProvenanceBadge';
import { TimelineBar }         from '@/components/overlay/TimelineBar';
import { PrivacyToggle }       from '@/components/overlay/PrivacyToggle';
import { DataModeSwitch }      from '@/components/overlay/DataModeSwitch';
import { Legend }               from '@/components/overlay/Legend';
import { StatsPanel }           from '@/components/overlay/StatsPanel';
import { CryptoList }          from '@/components/homegpu/CryptoList';
import { LoadingScreen }       from '@/components/homegpu/LoadingScreen';

const HomeGPUCanvas = dynamic(() => import('@/components/homegpu/HomeGPUCanvas'), {
  ssr: false,
});

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

export default function Home() {
  const [ready, setReady] = useState(false);
  const handleReady = useCallback(() => setReady(true), []);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black">
      {/* ── Full-screen loading overlay ── */}
      <AnimatePresence>
        {!ready && <LoadingScreen />}
      </AnimatePresence>

      {/* WebGPU 3D Scene wrapped in Suspense for code-split chunk loading */}
      <Suspense
        fallback={
          <div className="fixed inset-0 z-0 bg-black" />
        }
      >
        <HomeGPUCanvas onReady={handleReady} focusedNodeId={focusedNodeId} />
      </Suspense>

      {/* ── Top-left panel: logo + legend + stats ── */}
      <motion.div
        className="fixed top-5 left-5 z-10 flex flex-col gap-4"
        style={{ maxWidth: '230px' }}
        {...fadeUp}
        transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
      >
        {/* Logo */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: '#FFD200', boxShadow: '0 0 10px 3px rgba(255,210,0,0.7)' }}
            />
            <span className="font-sans font-semibold text-white text-sm tracking-wide">
              zKorp
              <span className="text-white/30 mx-1.5">&times;</span>
              <span style={{ color: '#FFD200' }}>Zama</span>
            </span>
          </div>
          <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-white/30 pl-4">
            Privacy Transaction Visualizer
          </p>
          <div
            className="h-px ml-4 mt-1"
            style={{ backgroundColor: '#FFD200', width: 120, boxShadow: '0 0 6px 2px rgba(255,210,0,0.4)' }}
          />
        </div>

        {/* Unified glass container for Legend + Stats */}
        <motion.div
          className="glass-panel noise-texture p-4 flex flex-col gap-3"
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.25, ease: 'easeOut' }}
        >
          <Legend />
          <div className="h-px" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
          <StatsPanel />
        </motion.div>
      </motion.div>

      {/* ── Right-side crypto list ── */}
      <motion.div
        className="fixed top-1/2 right-6 -translate-y-1/2 z-10 overflow-y-auto rounded-xl p-3"
        style={{
          maxHeight: '60vh',
          width: 180,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
        {...fadeUp}
        transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
      >
        <CryptoList focusedNodeId={focusedNodeId} onFocusNode={setFocusedNodeId} />
      </motion.div>

      {/* ── Top-right panel: FHE badge + mode indicator ── */}
      <motion.div
        className="fixed top-5 right-5 z-10 flex flex-col items-end gap-3"
        {...fadeUp}
        transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
      >
        <PrivacyToggle />
        <DataModeSwitch />
      </motion.div>

      {/* ── Overlays ── */}
      <InfoPanel />
      <ErrorBanner />
      <GifExporter />

      {/* Data provenance — above timeline */}
      <motion.div
        className="fixed bottom-36 left-5 z-20"
        {...fadeUp}
        transition={{ duration: 0.5, delay: 0.35, ease: 'easeOut' }}
      >
        <DataProvenanceBadge />
      </motion.div>

      {/* Timeline bar — full width bottom */}
      <TimelineBar />
    </main>
  );
}
