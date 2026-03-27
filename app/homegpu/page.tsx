'use client';

import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { InfoPanel }           from '@/components/overlay/InfoPanel';
import { ErrorBanner }         from '@/components/overlay/ErrorBanner';
import { GifExporter }         from '@/components/overlay/GifExporter';
import { DataProvenanceBadge } from '@/components/overlay/DataProvenanceBadge';
import { TimelineBar }         from '@/components/overlay/TimelineBar';
import { PrivacyToggle }       from '@/components/overlay/PrivacyToggle';
import { DataModeSwitch }      from '@/components/overlay/DataModeSwitch';
import { Legend }               from '@/components/overlay/Legend';
import { StatsPanel }           from '@/components/overlay/StatsPanel';

const HomeGPUCanvas = dynamic(() => import('@/components/homegpu/HomeGPUCanvas'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: '#FFD200', borderTopColor: 'transparent' }} />
        <p className="font-mono text-xs text-white/40 tracking-widest uppercase">
          Initialising WebGPU engine&hellip;
        </p>
      </div>
    </div>
  ),
});

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

export default function HomeGPU() {
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black">
      {/* WebGPU 3D Scene */}
      <HomeGPUCanvas />

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
            <span className="ml-2 text-[8px] text-yellow-400/60">[WebGPU]</span>
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
