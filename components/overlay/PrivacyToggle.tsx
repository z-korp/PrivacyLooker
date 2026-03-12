'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/appStore';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';

export function PrivacyToggle() {
  const privacyMode = useAppStore((s) => s.privacyMode);
  const setPrivacyMode = useAppStore((s) => s.setPrivacyMode);
  const isAvecZama = privacyMode === 'avec-zama';

  return (
    <motion.div
      className="fixed top-6 right-6 z-10 flex flex-col items-end gap-2"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3 }}
    >
      {/* Toggle container */}
      <motion.div
        className="flex items-center gap-3 px-4 py-3 rounded-xl border"
        animate={{
          borderColor: isAvecZama ? 'rgba(255,210,0,0.35)' : 'rgba(255,255,255,0.1)',
          backgroundColor: isAvecZama ? 'rgba(255,210,0,0.05)' : 'rgba(0,0,0,0.6)',
          boxShadow: isAvecZama ? '0 0 20px 4px rgba(255,210,0,0.2)' : 'none',
        }}
        transition={{ duration: 0.5 }}
        style={{ backdropFilter: 'blur(12px)' }}
      >
        <ToggleSwitch
          value={isAvecZama}
          onChange={(v) => setPrivacyMode(v ? 'avec-zama' : 'sans-zama')}
          labelA="Sans Zama"
          labelB="Avec Zama"
          useYellow
        />
      </motion.div>

      {/* Status label */}
      <AnimatePresence mode="wait">
        {isAvecZama ? (
          <motion.div
            key="avec"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-1.5 font-mono text-[9px] tracking-widest uppercase"
            style={{ color: '#FFD200' }}
          >
            <motion.div
              className="w-1.5 h-1.5 rounded-full bg-zama-yellow"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            />
            FHE Encryption Active
          </motion.div>
        ) : (
          <motion.div
            key="sans"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="font-mono text-[9px] tracking-widest uppercase text-white/25"
          >
            Public Ledger Mode
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
