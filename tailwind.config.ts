import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    'shadow-glow-yellow',
    'border-zama-yellow',
    'text-zama-yellow',
    'bg-zama-yellow',
    'ring-zama-yellow',
  ],
  theme: {
    extend: {
      colors: {
        'zama-yellow': '#FFD200',
        'noir': '#000000',
        'noir-soft': '#0a0a0a',
        'gray-dim': '#1a1a1a',
      },
      boxShadow: {
        'glow-yellow': '0 0 20px 4px rgba(255, 210, 0, 0.55)',
        'glow-yellow-lg': '0 0 40px 10px rgba(255, 210, 0, 0.45)',
        'glow-yellow-soft': '0 0 10px 2px rgba(255, 210, 0, 0.2)',
        'glow-white': '0 0 15px 3px rgba(255, 255, 255, 0.35)',
        'glow-white-soft': '0 0 8px 2px rgba(255, 255, 255, 0.12)',
        'glow-green-soft': '0 0 8px 2px rgba(74, 222, 128, 0.18)',
      },
      fontFamily: {
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'Space Mono', 'Courier New', 'monospace'],
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-glow': 'pulseGlow 2.5s ease-in-out infinite',
        'pulse-glow-soft': 'pulseGlowSoft 3s ease-in-out infinite',
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.35s ease-out',
        'shimmer': 'shimmer 3s ease-in-out infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 10px 2px rgba(255,210,0,0.4)' },
          '50%': { boxShadow: '0 0 35px 10px rgba(255,210,0,0.8)' },
        },
        pulseGlowSoft: {
          '0%, 100%': { boxShadow: '0 0 6px 1px rgba(255,210,0,0.15)' },
          '50%': { boxShadow: '0 0 16px 4px rgba(255,210,0,0.35)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
