'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/appStore';

/**
 * Floating badge — only visible in Live mode.
 * Proves the graph data is sourced from real on-chain transactions (not mocked),
 * with deep-links to Etherscan and the public Supabase endpoint.
 */
export function DataProvenanceBadge() {
  const dataMode   = useAppStore((s) => s.dataMode);
  const provenance = useAppStore((s) => s.provenance);
  const [open, setOpen] = useState(false);

  if (dataMode !== 'live' || !provenance) return null;

  const { totalWrapEvents, totalConfidential, blockRange, fetchedAt, supabaseUrl } = provenance;
  const fetchTime = new Date(fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="flex flex-col items-start gap-2">
      {/* ── Expanded panel ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="rounded-xl border border-white/10 p-4 flex flex-col gap-3 w-72"
            style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
              <span className="font-mono text-[11px] font-semibold text-green-400 tracking-wide">
                Verified On-Chain Data
              </span>
            </div>

            {/* Source */}
            <div>
              <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider block mb-1">Source</span>
              <span className="font-mono text-[10px] text-white/70">zamadashboard.org · Supabase</span>
            </div>

            {/* Counts */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider block">Shield / Unshield</span>
                <span className="font-mono text-base font-bold text-white">
                  {totalWrapEvents.toLocaleString()}
                </span>
                <span className="font-mono text-[8px] text-white/30 block">total on-chain</span>
              </div>
              <div>
                <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider block">Conf. Transfers</span>
                <span className="font-mono text-base font-bold text-white">
                  {totalConfidential.toLocaleString()}
                </span>
                <span className="font-mono text-[8px] text-white/30 block">FHE encrypted</span>
              </div>
            </div>

            {/* Block range */}
            {blockRange && (
              <div>
                <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider block mb-1">
                  Block Range (displayed)
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href={`https://etherscan.io/block/${blockRange.min}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[10px] text-green-400 hover:underline"
                  >
                    #{blockRange.min.toLocaleString()} ↗
                  </a>
                  <span className="font-mono text-[9px] text-white/20">→</span>
                  <a
                    href={`https://etherscan.io/block/${blockRange.max}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[10px] text-green-400 hover:underline"
                  >
                    #{blockRange.max.toLocaleString()} ↗
                  </a>
                </div>
              </div>
            )}

            {/* Verification links */}
            <div className="flex flex-col gap-1.5 pt-1 border-t border-white/5">
              <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider">Verify yourself</span>
              <a
                href={`${supabaseUrl}/rest/v1/wrapper_events?select=transaction_hash,block_number,event_type,token_symbol&order=block_number.desc&limit=10&apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuZ2x3aGp1c29oemJxc3JyZGRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NjE1ODcsImV4cCI6MjA4MjIzNzU4N30.3YXkvHqRERYADsYQ2Uqtcb6yMyCTyIwmEU6ojBYWhZI`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[9px] text-green-400 hover:underline break-all leading-relaxed"
              >
                wrapper_events (Supabase REST) ↗
              </a>
              <a
                href="https://etherscan.io/address/0xae0207c757aa2b4019ad96edd0092ddc63ef0c50"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[9px] text-green-400 hover:underline"
              >
                cUSDT contract on Etherscan ↗
              </a>
            </div>

            <span className="font-mono text-[8px] text-white/20">Last fetched {fetchTime}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Collapsed pill / toggle ─────────────────────────────────────────── */}
      <motion.button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 hover:border-green-400/40 transition-colors"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
        <span className="font-mono text-[9px] text-green-400 tracking-wide font-semibold">
          LIVE · {(totalWrapEvents + totalConfidential).toLocaleString()} txns
        </span>
        <span className="font-mono text-[8px] text-white/30 ml-1">{open ? '▼' : '▲'}</span>
      </motion.button>
    </div>
  );
}
