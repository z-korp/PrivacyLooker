'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/appStore';
import { GraphNode, GraphLink } from '@/types/graph';
import { toConfidential, truncateAddress } from '@/lib/tokenConfig';

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

function LinkPanel({ link, isAvecZama }: { link: GraphLink; isAvecZama: boolean }) {
  const from = typeof link.source === 'string' ? link.source : link.source.address;
  const to   = typeof link.target === 'string' ? link.target : link.target.address;
  const displayToken = isAvecZama ? toConfidential(link.tokenBase) : link.tokenBase;
  const style = EVENT_STYLES[link.eventType as keyof typeof EVENT_STYLES] ?? EVENT_STYLES.transfer;
  const isConfidential = link.eventType === 'confidential';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="w-3 h-px flex-shrink-0" style={{ backgroundColor: style.color }} />
        <span className="font-mono text-xs font-semibold" style={{ color: style.color }}>
          {style.label}
        </span>
        <span
          className="font-mono text-[8px] px-1.5 py-0.5 rounded border ml-auto"
          style={{ borderColor: `${style.color}40`, color: style.color }}
        >
          {displayToken}
        </span>
      </div>

      <div>
        <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider block mb-1">Amount</span>
        {isConfidential ? (
          <div className="flex flex-col gap-1">
            <span className="font-mono text-sm" style={{ color: '#c084fc' }}>🔒 FHE Encrypted</span>
            <span className="font-mono text-[9px] text-white/25 leading-relaxed">
              Amount permanently encrypted — never knowable in plaintext, even by validators.
            </span>
          </div>
        ) : isAvecZama ? (
          <span className="font-mono text-base text-zama-yellow">🔒 <span className="text-sm">Encrypted</span></span>
        ) : (
          <span className="font-mono text-xl font-bold text-white">
            {link.amountFormatted}{' '}
            <span className="text-sm font-normal text-white/50">{link.tokenBase}</span>
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div>
          <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider block">From</span>
          <code className="font-mono text-[10px] text-white/60">{truncateAddress(from)}</code>
        </div>
        <div>
          <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider block">To</span>
          <code className="font-mono text-[10px] text-white/60">{truncateAddress(to)}</code>
        </div>
      </div>

      {link.isLive && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="font-mono text-[9px] text-green-400">Live on-chain</span>
          </div>
          <a
            href={`https://etherscan.io/tx/${link.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[9px] hover:underline"
            style={{ color: '#4ade80' }}
          >
            Verify on Etherscan ↗
          </a>
          <code className="font-mono text-[8px] text-white/15 break-all mt-0.5">{link.txHash}</code>
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
