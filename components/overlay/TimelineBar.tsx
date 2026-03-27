'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/appStore';
import { TimelineWeek, TimelineData } from '@/types/graph';

const TOKEN_COLORS: Record<string, string> = {
  USDT: '#4ade80',
  USDC: '#60a5fa',
  ZAMA: '#FFD200',
  WETH: '#c084fc',
  BRON: '#fb923c',
  XAUt: '#facc15',
  tGBP: '#34d399',
};

const UNWRAP_COLORS: Record<string, string> = {
  USDT: '#f87171',
  USDC: '#f472b6',
  ZAMA: '#fbbf24',
  WETH: '#a78bfa',
  BRON: '#fb923c',
  XAUt: '#fde68a',
  tGBP: '#6ee7b7',
};

function getWrapColor(token: string)   { return TOKEN_COLORS[token]  ?? '#4ade80'; }
function getUnwrapColor(token: string) { return UNWRAP_COLORS[token] ?? '#f87171'; }

// ── Week column ───────────────────────────────────────────────────────────────
function WeekColumn({
  week,
  maxCount,
  token,
  isSelected,
  onClick,
}: {
  week: TimelineWeek;
  maxCount: number;
  token: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const counts =
    token === 'ALL'
      ? week.total
      : (week.tokens[token] ?? { wrap: 0, unwrap: 0 });

  const total = counts.wrap + counts.unwrap;
  if (total === 0 && token !== 'ALL') return <div className="w-10 flex-shrink-0" />;

  const BAR_HEIGHT = 56; // px — usable chart height
  const wrapH   = maxCount > 0 ? Math.max(2, Math.round((counts.wrap   / maxCount) * BAR_HEIGHT)) : 0;
  const unwrapH = maxCount > 0 ? Math.max(2, Math.round((counts.unwrap / maxCount) * BAR_HEIGHT)) : 0;

  const wrapColor   = token === 'ALL' ? '#4ade80' : getWrapColor(token);
  const unwrapColor = token === 'ALL' ? '#f87171' : getUnwrapColor(token);

  return (
    <motion.button
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 flex-shrink-0 w-10 rounded px-0.5 py-1 relative group"
      style={{
        background: isSelected ? 'rgba(255,255,255,0.07)' : 'transparent',
        border: isSelected ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
      }}
      whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
    >
      {/* Bars */}
      <div className="flex items-end gap-px" style={{ height: `${BAR_HEIGHT}px` }}>
        {/* Shield (wrap) bar */}
        <motion.div
          className="w-3 rounded-t-sm flex-shrink-0"
          initial={{ height: 0 }}
          animate={{ height: wrapH }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          style={{ backgroundColor: wrapColor, opacity: isSelected ? 1 : 0.7 }}
        />
        {/* Unshield (unwrap) bar */}
        <motion.div
          className="w-3 rounded-t-sm flex-shrink-0"
          initial={{ height: 0 }}
          animate={{ height: unwrapH }}
          transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.04 }}
          style={{ backgroundColor: unwrapColor, opacity: isSelected ? 1 : 0.7 }}
        />
      </div>

      {/* Week label */}
      <span
        className="font-mono text-[7px] leading-tight text-center whitespace-nowrap"
        style={{ color: isSelected ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)' }}
      >
        {week.weekLabel}
      </span>

      {/* Hover tooltip */}
      <div
        className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 pointer-events-none z-10
                   bg-black/90 border border-white/10 rounded px-2 py-1.5 whitespace-nowrap
                   opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ backdropFilter: 'blur(8px)' }}
      >
        <div className="font-mono text-[9px] text-white/60 mb-1">{week.weekLabel}</div>
        <div className="font-mono text-[9px]" style={{ color: wrapColor }}>
          ⬆ Shield: {counts.wrap.toLocaleString()}
        </div>
        <div className="font-mono text-[9px]" style={{ color: unwrapColor }}>
          ⬇ Unshield: {counts.unwrap.toLocaleString()}
        </div>
        {token === 'ALL' && (
          <div className="font-mono text-[8px] text-white/30 mt-0.5 border-t border-white/10 pt-0.5">
            Total: {total.toLocaleString()}
          </div>
        )}
      </div>
    </motion.button>
  );
}

// ── Token pill ────────────────────────────────────────────────────────────────
function TokenPill({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      className="font-mono text-[9px] px-2.5 py-1 rounded-full border flex-shrink-0"
      style={{
        borderColor: active ? (color ?? '#ffffff') + '80' : 'rgba(255,255,255,0.1)',
        backgroundColor: active ? (color ?? '#ffffff') + '18' : 'transparent',
        color: active ? (color ?? '#ffffff') : 'rgba(255,255,255,0.35)',
      }}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
    >
      {label}
    </motion.button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function TimelineBar() {
  const dataMode             = useAppStore((s) => s.dataMode);
  const selectedWeek         = useAppStore((s) => s.selectedWeek);
  const setSelectedWeek      = useAppStore((s) => s.setSelectedWeek);
  const selectedToken        = useAppStore((s) => s.selectedTimelineToken);
  const setSelectedToken     = useAppStore((s) => s.setSelectedTimelineToken);

  const [data, setData]       = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const scrollRef             = useRef<HTMLDivElement>(null);
  const hasFetched            = useRef(false);

  // Fetch timeline data once when switching to live mode
  useEffect(() => {
    if (dataMode !== 'live' || hasFetched.current) return;
    hasFetched.current = true;
    setLoading(true);
    fetch('/api/timeline')
      .then((r) => r.json())
      .then((d: TimelineData) => {
        setData(d);
        setError(null);
        // Auto-select the most recent week
        if (d.weeks.length > 0) {
          setSelectedWeek(d.weeks[d.weeks.length - 1]);
        }
      })
      .catch((e) => setError(e.message ?? 'Failed to load timeline'))
      .finally(() => setLoading(false));
  }, [dataMode, setSelectedWeek]);

  // Scroll to the end (most recent week) after data loads
  useEffect(() => {
    if (data && scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ left: scrollRef.current.scrollWidth, behavior: 'smooth' });
      }, 300);
    }
  }, [data]);

  const handleWeekClick = useCallback(
    (week: TimelineWeek) => {
      setSelectedWeek(selectedWeek?.weekStart === week.weekStart ? null : week);
    },
    [selectedWeek, setSelectedWeek]
  );

  if (dataMode !== 'live') return null;

  // Compute max count for scale normalization
  const maxCount = data
    ? Math.max(
        1,
        ...data.weeks.map((w) =>
          selectedToken === 'ALL'
            ? w.total.wrap + w.total.unwrap
            : (w.tokens[selectedToken]?.wrap ?? 0) + (w.tokens[selectedToken]?.unwrap ?? 0)
        )
      )
    : 1;

  const tokens = data?.tokens ?? [];

  return (
    <AnimatePresence>
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-10"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30, delay: 0.3 }}
        style={{
          background: 'rgba(10,10,10,0.6)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-stretch" style={{ height: '128px' }}>
          {/* ── Left sidebar: token pills + legend ───────────────────────── */}
          <div
            className="flex flex-col justify-between px-4 py-3 flex-shrink-0 border-r"
            style={{ borderColor: 'rgba(255,255,255,0.06)', width: '180px' }}
          >
            {/* Legend */}
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[8px] text-white/25 uppercase tracking-wider mb-0.5">
                Timeline · Weekly
              </span>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: '#4ade80' }} />
                <span className="font-mono text-[8px] text-white/50">Shield</span>
                <div className="w-2 h-2 rounded-sm flex-shrink-0 ml-2" style={{ backgroundColor: '#f87171' }} />
                <span className="font-mono text-[8px] text-white/50">Unshield</span>
              </div>
            </div>

            {/* Token pills */}
            <div className="flex flex-wrap gap-1 mt-1">
              <TokenPill
                label="ALL"
                active={selectedToken === 'ALL'}
                color="#ffffff"
                onClick={() => setSelectedToken('ALL')}
              />
              {tokens.map((t) => (
                <TokenPill
                  key={t}
                  label={t}
                  active={selectedToken === t}
                  color={TOKEN_COLORS[t]}
                  onClick={() => setSelectedToken(t)}
                />
              ))}
            </div>

            {/* Clear week filter */}
            {selectedWeek && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => setSelectedWeek(null)}
                className="font-mono text-[8px] text-white/30 hover:text-white/60 text-left mt-1"
              >
                ✕ Clear filter
              </motion.button>
            )}
          </div>

          {/* ── Bar chart ────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-hidden relative">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex gap-1">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <motion.div
                      key={i}
                      className="w-8 rounded-sm"
                      style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                      animate={{ height: [24, 48, 24] }}
                      transition={{ duration: 1.2, delay: i * 0.1, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-mono text-[9px] text-red-400/60">{error}</span>
              </div>
            )}

            {data && !loading && (
              <div
                ref={scrollRef}
                className="flex items-end h-full px-3 gap-1 overflow-x-auto pb-2 pt-2"
                style={{ scrollbarWidth: 'none' }}
              >
                {data.weeks.map((week) => (
                  <WeekColumn
                    key={week.weekStart}
                    week={week}
                    maxCount={maxCount}
                    token={selectedToken}
                    isSelected={selectedWeek?.weekStart === week.weekStart}
                    onClick={() => handleWeekClick(week)}
                  />
                ))}
              </div>
            )}

            {/* Selected week label */}
            {selectedWeek && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute top-2 right-3 font-mono text-[9px] text-white/50"
              >
                Showing week of{' '}
                <span className="text-white/80">{selectedWeek.weekLabel}</span>
              </motion.div>
            )}
          </div>

          {/* ── Right: total count ────────────────────────────────────────── */}
          {data && (
            <div
              className="flex flex-col justify-center items-end px-4 flex-shrink-0 border-l"
              style={{ borderColor: 'rgba(255,255,255,0.06)', width: '120px' }}
            >
              <span className="font-mono text-[8px] text-white/25 uppercase tracking-wider block mb-1">
                On-chain
              </span>
              <span className="font-mono text-xl font-bold text-white leading-none">
                {data.totalFetched.toLocaleString()}
              </span>
              <span className="font-mono text-[7px] text-white/25 mt-0.5">
                {selectedToken === 'ALL' ? 'all tokens' : selectedToken}
              </span>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
