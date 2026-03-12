'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/appStore';
import { TOKENS } from '@/lib/tokenConfig';

const TX_TYPES = [
  {
    eventType: 'wrap',
    label: 'Shield',
    subLabel: '(Wrap)',
    colors: { 'sans-zama': '#4ade80', 'avec-zama': '#86efac' },
  },
  {
    eventType: 'unwrap',
    label: 'Unshield',
    subLabel: '(Unwrap)',
    colors: { 'sans-zama': '#f87171', 'avec-zama': '#fca5a5' },
  },
  {
    eventType: 'confidential',
    label: 'Confidential Transfer',
    subLabel: '(FHE encrypted)',
    colors: { 'sans-zama': '#a78bfa', 'avec-zama': '#c084fc' },
  },
] as const;

export function Legend() {
  const privacyMode = useAppStore((s) => s.privacyMode);
  const isAvecZama = privacyMode === 'avec-zama';

  return (
    <motion.div
      className="fixed bottom-8 left-6 z-10 flex flex-col gap-3 max-w-[230px]"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, delay: 0.6 }}
    >
      {/* Privacy mode description */}
      <AnimatePresence mode="wait">
        <motion.div
          key={privacyMode}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="flex flex-col gap-1"
        >
          <div className="flex items-center gap-2">
            <motion.div
              className="w-2 h-2 rounded-full"
              animate={{
                backgroundColor: isAvecZama ? '#FFD200' : '#ffffff',
                boxShadow: isAvecZama ? '0 0 8px 2px rgba(255,210,0,0.6)' : 'none',
              }}
            />
            <span
              className="font-mono text-[10px] tracking-wider uppercase font-medium"
              style={{ color: isAvecZama ? '#FFD200' : '#ffffff' }}
            >
              {isAvecZama ? 'FHE Encrypted Ledger' : 'Public Ledger'}
            </span>
          </div>
          <p className="font-mono text-[9px] text-white/30 pl-4 leading-relaxed">
            {isAvecZama
              ? 'Amounts hidden via FHE. Shield/Unshield and confidential transfers visible on-chain.'
              : 'Shield/Unshield operations and confidential FHE transfers.'}
          </p>
        </motion.div>
      </AnimatePresence>

      {/* Node types */}
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[9px] text-white/20 tracking-widest uppercase">Nodes</span>
        <div className="flex flex-col gap-1">
          {/* Wrapper contract */}
          <div className="flex items-center gap-2">
            <motion.div
              className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
              animate={{
                borderColor: isAvecZama ? '#FFD200' : '#ffffff',
                boxShadow: isAvecZama ? '0 0 6px 2px rgba(255,210,0,0.5)' : 'none',
              }}
            >
              <div
                className="w-1 h-1 rounded-full"
                style={{ backgroundColor: isAvecZama ? '#FFD200' : '#ffffff' }}
              />
            </motion.div>
            <span className="font-mono text-[9px]" style={{ color: isAvecZama ? '#FFD200' : '#ffffff' }}>
              Zama wrapper contract
            </span>
          </div>
          {/* Wallet */}
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: isAvecZama ? '#FFD200' : '#ffffff', opacity: 0.6 }}
            />
            <span className="font-mono text-[9px] text-white/40">User wallet</span>
          </div>
        </div>
      </div>

      {/* Edge types */}
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[9px] text-white/20 tracking-widest uppercase">
          Transactions
        </span>
        <div className="flex flex-col gap-1.5">
          {TX_TYPES.map((t) => {
            const color = t.colors[privacyMode];
            return (
              <div key={t.eventType} className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-px" style={{ backgroundColor: color }} />
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: color, boxShadow: `0 0 4px 1px ${color}80` }}
                  />
                </div>
                <div>
                  <span className="font-mono text-[9px] font-medium" style={{ color }}>
                    {t.label}
                  </span>
                  <span className="font-mono text-[8px] text-white/25 ml-1">{t.subLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Token list */}
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[9px] text-white/20 tracking-widest uppercase">Tokens</span>
        <div className="flex flex-wrap gap-1.5">
          {TOKENS.map((token) => {
            const displaySymbol = isAvecZama ? `c${token.symbol}` : token.symbol;
            return (
              <motion.span
                key={token.symbol}
                className="font-mono text-[8px] px-1.5 py-0.5 rounded border"
                animate={{
                  borderColor: isAvecZama ? 'rgba(255,210,0,0.3)' : `${token.color}50`,
                  color: isAvecZama ? '#FFD200' : token.color,
                  backgroundColor: isAvecZama ? 'rgba(255,210,0,0.05)' : `${token.color}10`,
                }}
                transition={{ duration: 0.4 }}
              >
                {displaySymbol}
              </motion.span>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
