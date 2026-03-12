'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/appStore';
import { DataMode } from '@/types/graph';

export function DataModeSwitch() {
  const dataMode = useAppStore((s) => s.dataMode);
  const privacyMode = useAppStore((s) => s.privacyMode);
  const setDataMode = useAppStore((s) => s.setDataMode);
  const nodeCount = useAppStore((s) => s.nodeCount);
  const linkCount = useAppStore((s) => s.linkCount);
  const isLiveLoading = useAppStore((s) => s.isLiveLoading);
  const isAvecZama = privacyMode === 'avec-zama';

  const modes: { id: DataMode; label: string; sublabel: string }[] = [
    { id: 'simulation', label: 'Simulation', sublabel: 'Mocked data' },
    { id: 'live', label: 'Live Network', sublabel: 'On-chain data' },
  ];

  return (
    <motion.div
      className="fixed bottom-8 left-1/2 z-10 flex flex-col items-center gap-3"
      style={{ transform: 'translateX(-50%)' }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.5 }}
    >
      {/* Stats row */}
      <div className="flex items-center gap-4">
        <motion.span
          className="font-mono text-[10px] tracking-wider"
          animate={{ color: isAvecZama ? '#FFD200' : '#666666' }}
        >
          {nodeCount} nodes
        </motion.span>
        <span className="text-white/20 text-[10px]">·</span>
        <motion.span
          className="font-mono text-[10px] tracking-wider"
          animate={{ color: isAvecZama ? '#FFD200' : '#666666' }}
        >
          {linkCount} edges
        </motion.span>
        {dataMode === 'live' && isLiveLoading && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="font-mono text-[10px] text-green-400 flex items-center gap-1"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            fetching…
          </motion.span>
        )}
      </div>

      {/* Tab switcher */}
      <motion.div
        className="flex items-center p-1 rounded-xl border"
        animate={{
          borderColor: isAvecZama ? 'rgba(255,210,0,0.25)' : 'rgba(255,255,255,0.1)',
          backgroundColor: 'rgba(0,0,0,0.7)',
        }}
        style={{ backdropFilter: 'blur(12px)' }}
        transition={{ duration: 0.4 }}
      >
        {modes.map((mode) => {
          const isActive = dataMode === mode.id;
          return (
            <motion.button
              key={mode.id}
              onClick={() => setDataMode(mode.id)}
              className="relative px-5 py-2 rounded-lg focus:outline-none"
              style={{ zIndex: 1 }}
            >
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    layoutId="data-mode-pill"
                    className="absolute inset-0 rounded-lg"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                      backgroundColor: isAvecZama
                        ? 'rgba(255,210,0,0.12)'
                        : 'rgba(255,255,255,0.08)',
                      border: `1px solid ${isAvecZama ? 'rgba(255,210,0,0.4)' : 'rgba(255,255,255,0.2)'}`,
                    }}
                  />
                )}
              </AnimatePresence>
              <div className="relative flex flex-col items-center gap-0.5">
                <span
                  className="font-mono text-xs tracking-wider uppercase transition-colors duration-300"
                  style={{
                    color: isActive
                      ? isAvecZama
                        ? '#FFD200'
                        : '#ffffff'
                      : '#555555',
                  }}
                >
                  {mode.label}
                </span>
                <span
                  className="font-mono text-[8px] tracking-wide"
                  style={{
                    color: isActive ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)',
                  }}
                >
                  {mode.sublabel}
                </span>
              </div>
            </motion.button>
          );
        })}
      </motion.div>

      {/* Live mode notice */}
      <AnimatePresence>
        {dataMode === 'live' && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="font-mono text-[9px] text-white/30 tracking-wider text-center"
          >
            Click any live edge to verify on Etherscan ↗
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
