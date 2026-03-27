'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const PHASES = [
  'Initializing WebGPU renderer\u2026',
  'Loading on-chain data\u2026',
] as const;

const PHASE_DELAY_MS = 2200;

export function LoadingScreen() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (phase < PHASES.length - 1) setPhase((p) => p + 1);
    }, PHASE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
    >
      <div className="flex flex-col items-center gap-6">
        {/* Spinner ring */}
        <div className="relative w-16 h-16">
          <div
            className="absolute inset-0 rounded-full border-2 border-t-transparent animate-spin"
            style={{
              borderColor: 'rgba(255,210,0,0.3)',
              borderTopColor: 'transparent',
            }}
          />
          <div
            className="absolute inset-0 rounded-full border-2 border-t-transparent animate-spin"
            style={{
              borderColor: '#FFD200',
              borderTopColor: 'transparent',
              animationDuration: '0.8s',
            }}
          />
          {/* Inner glow dot */}
          <div
            className="absolute top-1/2 left-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              backgroundColor: '#FFD200',
              boxShadow: '0 0 12px 4px rgba(255,210,0,0.5)',
            }}
          />
        </div>

        {/* Phase text */}
        <motion.p
          key={phase}
          className="font-mono text-xs tracking-widest uppercase"
          style={{ color: 'rgba(255,255,255,0.4)' }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          {PHASES[phase]}
        </motion.p>

        {/* Brand mark */}
        <div className="flex items-center gap-2 mt-4">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: '#FFD200', boxShadow: '0 0 6px 2px rgba(255,210,0,0.5)' }}
          />
          <span className="font-sans text-[10px] font-medium tracking-wide text-white/20">
            zKorp <span className="text-white/10 mx-1">&times;</span> Zama
          </span>
        </div>
      </div>
    </motion.div>
  );
}
