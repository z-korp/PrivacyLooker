'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/appStore';
import { formatTokenAmount } from '@/lib/tokenConfig';

// Approximate USD price for TVS display
const USD_PRICE: Record<string, number> = {
  USDT: 1,
  USDC: 1,
  ZAMA: 1,   // no public price — treat as $1 unit for rough indication
  WETH: 3500,
  BRON: 0,
  XAUt: 0,
  tGBP: 1.27,
};

function formatTVS(tvs: number, decimals: number, symbol: string): string {
  const humanAmount = tvs / Math.pow(10, decimals);
  const price = USD_PRICE[symbol];
  if (price && price > 0) {
    const usd = humanAmount * price;
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
    if (usd >= 1_000)     return `$${(usd / 1_000).toFixed(1)}K`;
    return `$${usd.toFixed(0)}`;
  }
  return formatTokenAmount(tvs, decimals) + ` ${symbol}`;
}

function StatRow({
  label,
  value,
  color = 'rgba(255,255,255,0.75)',
  sub,
}: {
  label: string;
  value: string | number;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="font-mono text-[8px] text-white/25 uppercase tracking-widest flex-shrink-0">{label}</span>
      <div className="text-right">
        <motion.span
          key={String(value)}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-mono text-sm font-bold"
          style={{ color }}
        >
          {typeof value === 'number' ? value.toLocaleString() : value}
        </motion.span>
        {sub && <span className="font-mono text-[8px] text-white/20 ml-1">{sub}</span>}
      </div>
    </div>
  );
}

export function StatsPanel() {
  const liveStats   = useAppStore((s) => s.liveStats);
  const dataMode    = useAppStore((s) => s.dataMode);
  const selectedWeek = useAppStore((s) => s.selectedWeek);
  const selectedToken = useAppStore((s) => s.selectedTimelineToken);
  const provenance  = useAppStore((s) => s.provenance);

  if (!liveStats) return null;

  const { shieldCount, unshieldCount, confCount, totalEvents, tvsByToken } = liveStats;

  // Total TVS across stablecoin tokens (USDT + USDC)
  const totalTVS_USD = tvsByToken.reduce((sum, t) => {
    const price = USD_PRICE[t.symbol] ?? 0;
    if (!price) return sum;
    return sum + (t.tvs / Math.pow(10, t.decimals)) * price;
  }, 0);

  const tvsDisplay = totalTVS_USD >= 1_000_000
    ? `$${(totalTVS_USD / 1_000_000).toFixed(2)}M`
    : totalTVS_USD >= 1_000
    ? `$${(totalTVS_USD / 1_000).toFixed(1)}K`
    : `$${totalTVS_USD.toFixed(0)}`;

  const isFiltered = selectedWeek !== null || selectedToken !== 'ALL';

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[8px] text-white/20 tracking-widest uppercase font-medium">
          Live Stats
        </span>
        <AnimatePresence>
          {isFiltered && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="font-mono text-[8px] px-1.5 py-0.5 rounded border"
              style={{ borderColor: 'rgba(255,210,0,0.3)', color: '#FFD200', backgroundColor: 'rgba(255,210,0,0.08)' }}
            >
              {selectedWeek ? selectedWeek.weekLabel : selectedToken}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Stats grid */}
      <div
        className="flex flex-col gap-1.5 rounded-lg p-2.5 glass-highlight"
      >
        <StatRow
          label="Shield"
          value={shieldCount}
          color="#86efac"
        />
        <div className="h-px" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
        <StatRow
          label="Unshield"
          value={unshieldCount}
          color="#fca5a5"
        />
        <div className="h-px" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
        <StatRow
          label="Total events"
          value={dataMode === 'live' && provenance ? provenance.totalWrapEvents + provenance.totalConfidential : totalEvents}
          color="rgba(255,255,255,0.75)"
          sub={isFiltered ? 'filtered' : 'on-chain'}
        />
        {totalTVS_USD > 0 && (
          <>
            <div className="h-px" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }} />
            <StatRow
              label="TVS"
              value={tvsDisplay}
              color="#FFD200"
              sub="approx."
            />
          </>
        )}
      </div>

      {/* Per-token TVS breakdown (only show when meaningful) */}
      {tvsByToken.length > 0 && (
        <div className="flex flex-col gap-1">
          {tvsByToken.slice(0, 4).map((t) => (
            <div key={t.symbol} className="flex items-center justify-between">
              <span className="font-mono text-[8px]" style={{ color: 'rgba(255,210,0,0.5)' }}>c{t.symbol}</span>
              <span className="font-mono text-[8px] text-white/30">
                {formatTVS(t.tvs, t.decimals, t.symbol)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
