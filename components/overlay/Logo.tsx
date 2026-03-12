'use client';

import { motion } from 'framer-motion';
import { useAppStore } from '@/store/appStore';

export function Logo() {
  const privacyMode = useAppStore((s) => s.privacyMode);
  const isAvecZama = privacyMode === 'avec-zama';

  return (
    <motion.div
      className="fixed top-6 left-6 z-10 flex flex-col gap-1"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
    >
      {/* Wordmark */}
      <div className="flex items-center gap-2">
        <motion.div
          className="w-2 h-2 rounded-full"
          animate={{
            backgroundColor: isAvecZama ? '#FFD200' : '#ffffff',
            boxShadow: isAvecZama ? '0 0 10px 3px rgba(255,210,0,0.7)' : 'none',
          }}
          transition={{ duration: 0.5 }}
        />
        <span className="font-sans font-semibold text-white text-sm tracking-wide">
          zKorp
          <span className="text-white/30 mx-1.5">×</span>
          <motion.span
            animate={{ color: isAvecZama ? '#FFD200' : '#ffffff' }}
            transition={{ duration: 0.5 }}
          >
            Zama
          </motion.span>
        </span>
      </div>

      {/* Subtitle */}
      <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-white/30 pl-4">
        Privacy Transaction Visualizer
      </p>

      {/* Decorative line */}
      <motion.div
        className="h-px ml-4 mt-1"
        animate={{
          backgroundColor: isAvecZama ? '#FFD200' : '#333333',
          width: isAvecZama ? 120 : 60,
          boxShadow: isAvecZama ? '0 0 6px 2px rgba(255,210,0,0.4)' : 'none',
        }}
        transition={{ duration: 0.6 }}
      />
    </motion.div>
  );
}
