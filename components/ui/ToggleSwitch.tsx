'use client';

import { motion } from 'framer-motion';

interface ToggleSwitchProps {
  value: boolean;
  onChange: (value: boolean) => void;
  labelA: string;
  labelB: string;
  /** When true, the active state uses Zama yellow */
  useYellow?: boolean;
  size?: 'sm' | 'md';
}

export function ToggleSwitch({
  value,
  onChange,
  labelA,
  labelB,
  useYellow = false,
  size = 'md',
}: ToggleSwitchProps) {
  const isSmall = size === 'sm';
  const activeColor = useYellow && value ? '#FFD200' : '#ffffff';
  const inactiveColor = '#555555';

  return (
    <button
      onClick={() => onChange(!value)}
      className="flex items-center gap-2 group focus:outline-none"
      aria-pressed={value}
    >
      {/* Label A */}
      <span
        className={`font-mono transition-colors duration-200 ${isSmall ? 'text-[10px]' : 'text-xs'} tracking-wider uppercase`}
        style={{ color: !value ? activeColor : inactiveColor }}
      >
        {labelA}
      </span>

      {/* Track */}
      <div
        className={`relative flex-shrink-0 rounded-full cursor-pointer border transition-colors duration-300 ${
          isSmall ? 'w-8 h-4' : 'w-11 h-6'
        }`}
        style={{
          borderColor: value && useYellow ? '#FFD200' : '#555',
          backgroundColor: 'transparent',
        }}
      >
        {/* Thumb */}
        <motion.div
          className={`absolute top-1/2 -translate-y-1/2 rounded-full ${
            isSmall ? 'w-2.5 h-2.5' : 'w-4 h-4'
          }`}
          animate={{
            x: value
              ? isSmall
                ? 16
                : 22
              : isSmall
              ? 2
              : 4,
            backgroundColor: value && useYellow ? '#FFD200' : '#ffffff',
            boxShadow:
              value && useYellow
                ? '0 0 10px 3px rgba(255,210,0,0.7)'
                : value
                ? '0 0 6px 2px rgba(255,255,255,0.4)'
                : 'none',
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </div>

      {/* Label B */}
      <span
        className={`font-mono transition-colors duration-200 ${isSmall ? 'text-[10px]' : 'text-xs'} tracking-wider uppercase`}
        style={{ color: value ? activeColor : inactiveColor }}
      >
        {labelB}
      </span>
    </button>
  );
}
