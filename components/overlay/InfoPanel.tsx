'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/appStore';
import { GraphNode, GraphLink } from '@/types/graph';

// ── Node panel ────────────────────────────────────────────────────────────────
function NodePanel({ node, isAvecZama }: { node: GraphNode; isAvecZama: boolean }) {
  const isWrapper = node.isWrapperContract;
  const accent = isWrapper ? '#FFD200' : isAvecZama ? '#FFD200' : '#ffffff';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {isWrapper ? (
          <motion.div
            className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
            animate={{
              borderColor: '#FFD200',
              boxShadow: '0 0 8px 2px rgba(255,210,0,0.5)',
            }}
          >
            <div className="w-1 h-1 rounded-full" style={{ backgroundColor: '#FFD200' }} />
          </motion.div>
        ) : (
          <motion.div className="w-3 h-3 rounded-full flex-shrink-0" animate={{ backgroundColor: accent }} />
        )}
        <span className="font-mono text-xs font-semibold" style={{ color: accent }}>
          {isWrapper ? `c${node.tokenSymbol} Wrapper` : 'Wallet'}
        </span>
        {isWrapper && (
          <span
            className="font-mono text-[8px] px-1.5 py-0.5 rounded border ml-auto"
            style={{ borderColor: '#FFD20055', color: '#FFD200', backgroundColor: '#FFD20010' }}
          >
            Zama Contract
          </span>
        )}
      </div>

      <div>
        <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider block mb-1">Address</span>
        <code className="font-mono text-[10px] break-all text-white/80 leading-relaxed">
          {node.address}
        </code>
      </div>

      <div className="flex gap-4">
        <div>
          <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider block">Txns</span>
          <span className="font-mono text-xl font-bold" style={{ color: accent }}>{node.txCount}</span>
        </div>
        {isWrapper && node.tvs != null && node.tvs > 0 && (
          <div>
            <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider block">TVS (raw)</span>
            <span className="font-mono text-xl font-bold" style={{ color: accent }}>
              {(node.tvs / 1e9).toFixed(2)}B
            </span>
          </div>
        )}
      </div>

      <a
        href={`https://etherscan.io/address/${node.address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-[9px] tracking-wider hover:underline"
        style={{ color: isWrapper ? '#FFD200' : '#4ade80' }}
      >
        View on Etherscan ↗
      </a>
    </div>
  );
}

// ── Link panel ────────────────────────────────────────────────────────────────
const EVENT_STYLES = {
  wrap:         { color: '#4ade80', label: '⬆ Shield',               subLabel: 'Wrap' },
  unwrap:       { color: '#f87171', label: '⬇ Unshield',             subLabel: 'Unwrap' },
  confidential: { color: '#a78bfa', label: '🔒 Confidential Transfer', subLabel: 'FHE Encrypted' },
  transfer:     { color: '#888888', label: 'Transfer',                subLabel: 'ERC-20' },
} as const;

// Show at most this many tx hashes in the scrollable list
const MAX_VISIBLE_TXS = 8;

function LinkPanel({ link, isAvecZama }: { link: GraphLink; isAvecZama: boolean }) {
  const from = typeof link.source === 'string' ? link.source : link.source.address;
  const to   = typeof link.target === 'string' ? link.target : link.target.address;
  const style = EVENT_STYLES[link.eventType as keyof typeof EVENT_STYLES] ?? EVENT_STYLES.transfer;
  const isConfidential = link.eventType === 'confidential';
  const isAggregated = link.aggregatedCount > 1;

  return (
    <div className="flex flex-col gap-3">
      {/* ── Transformation headline ── */}
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-sm font-bold tracking-wide" style={{ color: style.color }}>
          {link.transformLabel}
        </span>
        <div className="flex items-center gap-2">
          <div className="w-3 h-px flex-shrink-0" style={{ backgroundColor: style.color }} />
          <span className="font-mono text-[9px] opacity-70" style={{ color: style.color }}>
            {style.label}
          </span>
          {isAggregated && (
            <span
              className="ml-auto font-mono text-[8px] px-1.5 py-0.5 rounded border"
              style={{ borderColor: `${style.color}40`, color: style.color, backgroundColor: `${style.color}10` }}
            >
              {link.aggregatedCount} txns
            </span>
          )}
        </div>
      </div>

      {/* ── Amount ── */}
      <div>
        <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider block mb-1">
          {isAggregated ? 'Total Volume' : 'Amount'}
        </span>
        {isConfidential ? (
          <div className="flex flex-col gap-1">
            <span className="font-mono text-sm" style={{ color: '#c084fc' }}>🔒 FHE Encrypted</span>
            <span className="font-mono text-[9px] text-white/25 leading-relaxed">
              Amount permanently encrypted by FHE — never readable, even by validators.
            </span>
          </div>
        ) : isAvecZama ? (
          <span className="font-mono text-base" style={{ color: '#FFD200' }}>🔒 Encrypted</span>
        ) : (
          <span className="font-mono text-xl font-bold text-white">
            {link.amountFormatted}{' '}
            <span className="text-sm font-normal text-white/50">{link.tokenBase}</span>
          </span>
        )}
      </div>

      {/* ── From / To addresses ── */}
      <div className="flex flex-col gap-1.5">
        <div>
          <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider block">From</span>
          <code className="font-mono text-[10px] text-white/60 break-all">{from}</code>
        </div>
        <div>
          <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider block">To</span>
          <code className="font-mono text-[10px] text-white/60 break-all">{to}</code>
        </div>
      </div>

      {/* ── Transaction list ── */}
      {link.isLive && link.txHashes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
            <span className="font-mono text-[9px] text-green-400">
              {isAggregated
                ? `${link.aggregatedCount} on-chain transactions · showing ${Math.min(link.txHashes.length, MAX_VISIBLE_TXS)}`
                : 'Live on-chain'}
            </span>
          </div>

          <div
            className="flex flex-col gap-1 overflow-y-auto pr-1"
            style={{ maxHeight: isAggregated ? '130px' : 'none' }}
          >
            {link.txHashes.slice(0, MAX_VISIBLE_TXS).map((hash, i) => (
              <div key={hash} className="flex items-center gap-2">
                {link.blockNumbers[i] != null && (
                  <span className="font-mono text-[8px] text-white/25 flex-shrink-0">
                    #{link.blockNumbers[i]}
                  </span>
                )}
                <a
                  href={`https://etherscan.io/tx/${hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[8px] hover:underline truncate"
                  style={{ color: '#4ade80' }}
                  title={hash}
                >
                  {hash.slice(0, 14)}…{hash.slice(-6)} ↗
                </a>
              </div>
            ))}
            {link.txHashes.length > MAX_VISIBLE_TXS && (
              <span className="font-mono text-[8px] text-white/20">
                + {link.txHashes.length - MAX_VISIBLE_TXS} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Panel container ───────────────────────────────────────────────────────────
export function InfoPanel() {
  const selectedNode    = useAppStore((s) => s.selectedNode);
  const selectedLink    = useAppStore((s) => s.selectedLink);
  const setSelectedNode = useAppStore((s) => s.setSelectedNode);
  const setSelectedLink = useAppStore((s) => s.setSelectedLink);
  const privacyMode     = useAppStore((s) => s.privacyMode);
  const isAvecZama      = privacyMode === 'avec-zama';
  const isOpen          = selectedNode !== null || selectedLink !== null;
  const isWrapper       = selectedNode?.isWrapperContract ?? false;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed top-24 right-6 z-20 w-72"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 30 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        >
          <motion.div
            className="relative rounded-xl border p-4 flex flex-col gap-3"
            animate={{
              borderColor: (isWrapper || isAvecZama) ? 'rgba(255,210,0,0.3)' : 'rgba(255,255,255,0.1)',
              backgroundColor: 'rgba(0,0,0,0.88)',
              boxShadow: (isWrapper || isAvecZama) ? '0 0 30px 8px rgba(255,210,0,0.1)' : 'none',
            }}
            style={{ backdropFilter: 'blur(16px)' }}
            transition={{ duration: 0.4 }}
          >
            <button
              onClick={() => { setSelectedNode(null); setSelectedLink(null); }}
              className="absolute top-3 right-3 w-5 h-5 flex items-center justify-center rounded-full text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors font-mono text-xs"
            >
              ✕
            </button>
            {selectedNode && <NodePanel node={selectedNode} isAvecZama={isAvecZama} />}
            {selectedLink  && <LinkPanel link={selectedLink}   isAvecZama={isAvecZama} />}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
