'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTransactions } from '@/hooks/useTransactions';

const TOKEN_DOT_COLOR: Record<string, string> = {
  USDT: '#26a17b',
  USDC: '#2775ca',
  WETH: '#627eea',
  ZAMA: '#ffd200',
  BRON: '#e8821d',
  XAUt: '#d4af37',
  tGBP: '#1a5fa8',
};

const SLIDESHOW_INTERVAL = 5000;

interface CryptoListProps {
  focusedNodeId: string | null;
  onFocusNode: (nodeId: string | null) => void;
}

export function CryptoList({ focusedNodeId, onFocusNode }: CryptoListProps) {
  const { graphData } = useTransactions();
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slideshowIdx = useRef(0);

  const wrapperNodes = useMemo(() => {
    return graphData.nodes
      .filter((n) => n.isWrapperContract)
      .sort((a, b) => b.txCount - a.txCount);
  }, [graphData.nodes]);

  // Build the slideshow sequence: [null (All), ...node ids]
  const sequence = useMemo(() => {
    return [null, ...wrapperNodes.map((n) => n.id)];
  }, [wrapperNodes]);

  const stopSlideshow = useCallback(() => {
    setPlaying(false);
    setProgress(0);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null; }
  }, []);

  const startSlideshow = useCallback(() => {
    if (sequence.length <= 1) return;
    // Start from current focused node's position in sequence
    const curIdx = sequence.indexOf(focusedNodeId);
    slideshowIdx.current = curIdx >= 0 ? curIdx : 0;
    setPlaying(true);
    setProgress(0);

    // Progress ticker: update every 50ms for smooth bar
    progressRef.current = setInterval(() => {
      setProgress((p) => Math.min(p + 50 / SLIDESHOW_INTERVAL, 1));
    }, 50);

    // Advance to next item
    intervalRef.current = setInterval(() => {
      setProgress(0);
      slideshowIdx.current = (slideshowIdx.current + 1) % sequence.length;
      onFocusNode(sequence[slideshowIdx.current]);
    }, SLIDESHOW_INTERVAL);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequence, onFocusNode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, []);

  // Manual click stops the slideshow
  const handleManualFocus = useCallback(
    (nodeId: string | null) => {
      if (playing) stopSlideshow();
      onFocusNode(nodeId);
    },
    [playing, stopSlideshow, onFocusNode],
  );

  const toggleSlideshow = useCallback(() => {
    if (playing) {
      stopSlideshow();
    } else {
      startSlideshow();
    }
  }, [playing, stopSlideshow, startSlideshow]);

  if (wrapperNodes.length === 0) return null;

  const isAllFocused = focusedNodeId === null;

  return (
    <motion.div
      className="flex flex-col gap-1.5"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3, ease: 'easeOut' }}
    >
      {/* Header */}
      <span className="font-mono text-[9px] text-white/20 tracking-widest uppercase">
        Contracts
      </span>

      {/* Token list */}
      <div
        className="flex flex-col gap-0.5 rounded-lg p-1.5"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* ALL button */}
        <ListItem
          focused={isAllFocused}
          playing={playing}
          progress={isAllFocused ? progress : 0}
          onClick={() => handleManualFocus(null)}
        >
          <div
            className="w-2 h-2 rounded-sm flex-shrink-0 flex items-center justify-center"
            style={{ color: isAllFocused ? '#FFD200' : 'rgba(255,255,255,0.4)' }}
          >
            <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="8" r="3" />
              <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="8" cy="8" r="7.5" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
            </svg>
          </div>
          <span
            className="font-mono text-[10px] font-semibold flex-1 text-left tracking-wider"
            style={{ color: isAllFocused ? '#FFD200' : 'rgba(255,255,255,0.5)' }}
          >
            ALL
          </span>
        </ListItem>

        {/* Separator */}
        <div className="h-px mx-1" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />

        {/* Individual tokens */}
        {wrapperNodes.map((node) => {
          const sym = node.tokenSymbol ?? '?';
          const dotColor = TOKEN_DOT_COLOR[sym] ?? '#ffd200';
          const isFocused = focusedNodeId === node.id;

          return (
            <ListItem
              key={node.id}
              focused={isFocused}
              playing={playing}
              progress={isFocused ? progress : 0}
              onClick={() => handleManualFocus(isFocused ? null : node.id)}
            >
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: dotColor,
                  boxShadow: isFocused ? `0 0 6px 2px ${dotColor}80` : 'none',
                }}
              />
              <span
                className="font-mono text-[10px] font-medium flex-1 text-left"
                style={{ color: isFocused ? '#FFD200' : 'rgba(255,255,255,0.55)' }}
              >
                c{sym}
              </span>
              <span
                className="font-mono text-[9px] tabular-nums"
                style={{ color: isFocused ? 'rgba(255,210,0,0.7)' : 'rgba(255,255,255,0.25)' }}
              >
                {node.txCount}
              </span>
            </ListItem>
          );
        })}
      </div>

      {/* Play/Pause button */}
      <button
        onClick={toggleSlideshow}
        className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors"
        style={{
          background: playing ? 'rgba(255,210,0,0.1)' : 'rgba(255,255,255,0.03)',
          border: playing ? '1px solid rgba(255,210,0,0.3)' : '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {playing ? (
          <svg width="10" height="10" viewBox="0 0 16 16" fill="#FFD200">
            <rect x="3" y="2" width="4" height="12" rx="1" />
            <rect x="9" y="2" width="4" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 16 16" fill="rgba(255,255,255,0.5)">
            <path d="M4 2l10 6-10 6V2z" />
          </svg>
        )}
        <span
          className="font-mono text-[9px] tracking-wider uppercase"
          style={{ color: playing ? '#FFD200' : 'rgba(255,255,255,0.35)' }}
        >
          {playing ? 'Pause' : 'Autoplay'}
        </span>
      </button>
    </motion.div>
  );
}

/** Shared list item with optional progress bar overlay */
function ListItem({
  focused,
  playing,
  progress,
  onClick,
  children,
}: {
  focused: boolean;
  playing: boolean;
  progress: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      onClick={onClick}
      className="relative flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer overflow-hidden"
      style={{
        background: focused ? 'rgba(255,210,0,0.1)' : 'transparent',
        border: focused ? '1px solid rgba(255,210,0,0.4)' : '1px solid transparent',
        boxShadow: focused ? '0 0 8px 1px rgba(255,210,0,0.15)' : 'none',
      }}
      whileHover={{
        backgroundColor: focused ? 'rgba(255,210,0,0.12)' : 'rgba(255,255,255,0.04)',
      }}
      layout
    >
      {/* Progress bar (only when playing + focused) */}
      {playing && focused && progress > 0 && (
        <div
          className="absolute bottom-0 left-0 h-[2px]"
          style={{
            width: `${progress * 100}%`,
            background: 'linear-gradient(90deg, rgba(255,210,0,0.3), #FFD200)',
            transition: 'width 50ms linear',
          }}
        />
      )}
      {children}
    </motion.button>
  );
}
