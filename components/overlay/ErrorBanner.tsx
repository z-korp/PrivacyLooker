'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/appStore';

export function ErrorBanner() {
  const error = useAppStore((s) => s.dataError);

  return (
    <AnimatePresence>
      {error && (
        <motion.div
          className="fixed top-20 left-1/2 z-30"
          style={{ transform: 'translateX(-50%)' }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 backdrop-blur-md">
            <span className="text-amber-400 text-xs">⚠</span>
            <p className="font-mono text-[10px] text-amber-400/80">{error}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
