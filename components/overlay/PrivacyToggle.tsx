'use client';

import { motion } from 'framer-motion';

/**
 * Static FHE badge — the toggle has been removed.
 * FHE encryption mode is always active.
 */
export function PrivacyToggle() {
  return (
    <motion.div
      className="flex flex-col items-end gap-1.5"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
    >
      {/* "With FHE" badge */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl border"
        style={{
          borderColor: 'rgba(255,210,0,0.35)',
          backgroundColor: 'rgba(255,210,0,0.05)',
          boxShadow: '0 0 16px 3px rgba(255,210,0,0.12)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <motion.div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: '#FFD200' }}
          animate={{ opacity: [1, 0.4, 1], boxShadow: ['0 0 6px 2px rgba(255,210,0,0.7)', '0 0 2px 1px rgba(255,210,0,0.2)', '0 0 6px 2px rgba(255,210,0,0.7)'] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
        />
        <span className="font-mono text-[10px] font-semibold tracking-wide" style={{ color: '#FFD200' }}>
          With FHE
        </span>
      </div>

      {/* Status label */}
      <div className="flex items-center gap-1.5">
        <motion.div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: '#FFD200' }}
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        />
        <span className="font-mono text-[9px] tracking-widest uppercase" style={{ color: '#FFD200' }}>
          FHE Encryption Active
        </span>
      </div>
    </motion.div>
  );
}
