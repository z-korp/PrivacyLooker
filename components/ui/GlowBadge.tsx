'use client';

import { motion, AnimatePresence } from 'framer-motion';

interface GlowBadgeProps {
  children: React.ReactNode;
  glow?: boolean;
  variant?: 'yellow' | 'white' | 'green' | 'red';
}

const variantStyles = {
  yellow: {
    color: '#FFD200',
    borderColor: 'rgba(255,210,0,0.3)',
    bg: 'rgba(255,210,0,0.06)',
    shadow: '0 0 8px 2px rgba(255,210,0,0.25)',
  },
  white: {
    color: '#ffffff',
    borderColor: 'rgba(255,255,255,0.2)',
    bg: 'rgba(255,255,255,0.04)',
    shadow: '0 0 6px 2px rgba(255,255,255,0.15)',
  },
  green: {
    color: '#4ade80',
    borderColor: 'rgba(74,222,128,0.25)',
    bg: 'rgba(74,222,128,0.05)',
    shadow: '0 0 6px 2px rgba(74,222,128,0.2)',
  },
  red: {
    color: '#f87171',
    borderColor: 'rgba(248,113,113,0.25)',
    bg: 'rgba(248,113,113,0.05)',
    shadow: 'none',
  },
};

export function GlowBadge({ children, glow = false, variant = 'white' }: GlowBadgeProps) {
  const styles = variantStyles[variant];

  return (
    <motion.span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono tracking-wider uppercase border whitespace-nowrap"
      animate={{
        boxShadow: glow ? styles.shadow : 'none',
        borderColor: styles.borderColor,
        backgroundColor: styles.bg,
        color: styles.color,
      }}
      transition={{ duration: 0.4 }}
    >
      {children}
    </motion.span>
  );
}
