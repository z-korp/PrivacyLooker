'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/appStore';

/**
 * Live network indicator — simulation mode removed.
 * Shows node / edge counts and a live fetch spinner.
 */
export function DataModeSwitch() {
  const nodeCount     = useAppStore((s) => s.nodeCount);
  const linkCount     = useAppStore((s) => s.linkCount);
  const isLiveLoading = useAppStore((s) => s.isLiveLoading);

  return (
    <motion.div
      className="flex flex-col items-end gap-2"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
    >
      {/* Live badge */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border noise-texture"
        style={{
          borderColor: 'rgba(74,222,128,0.15)',
          backgroundColor: 'rgba(10,10,10,0.55)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <AnimatePresence mode="wait">
          {isLiveLoading ? (
            <motion.div
              key="loading"
              className="w-1.5 h-1.5 rounded-full bg-green-400"
              animate={{ opacity: [1, 0.2, 1] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
            />
          ) : (
            <motion.div
              key="idle"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"
            />
          )}
        </AnimatePresence>
        <span className="font-mono text-[9px] text-green-400 tracking-wider uppercase font-semibold">
          {isLiveLoading ? 'Fetching…' : 'Live Network'}
        </span>
      </div>

      {/* Counts */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-[9px] tracking-wider" style={{ color: '#FFD200' }}>
          {nodeCount} nodes
        </span>
        <span className="text-white/20 text-[8px]">·</span>
        <span className="font-mono text-[9px] tracking-wider" style={{ color: '#FFD200' }}>
          {linkCount} edges
        </span>
      </div>

      {/* Hint */}
      <p className="font-mono text-[8px] text-white/20 tracking-wider text-right">
        Click any edge to verify on Etherscan ↗
      </p>
    </motion.div>
  );
}
