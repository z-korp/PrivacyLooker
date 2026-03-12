'use client';

import dynamic from 'next/dynamic';
import { useWindowSize } from '@/hooks/useWindowSize';

// SSR firewall: ForceGraph3DWrapper uses three.js + browser globals
const ForceGraph3DWrapper = dynamic(() => import('./ForceGraph3DWrapper'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-noir">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-zama-yellow border-t-transparent rounded-full animate-spin" />
        <p className="font-mono text-xs text-white/40 tracking-widest uppercase">
          Initialising graph engine…
        </p>
      </div>
    </div>
  ),
});

export function GraphCanvas() {
  const { width, height } = useWindowSize();

  return (
    <div className="fixed inset-0 z-0">
      <ForceGraph3DWrapper width={width} height={height} />
    </div>
  );
}
