'use client';

// Always avec-zama (FHE mode) — privacy toggle removed

const TX_TYPES = [
  { label: 'Shield',   subLabel: 'TOKEN → cTOKEN', color: '#86efac' },
  { label: 'Unshield', subLabel: 'cTOKEN → TOKEN', color: '#fca5a5' },
] as const;

const TOKEN_PILLS = [
  { symbol: 'cUSDT',  color: '#FFD200' },
  { symbol: 'cUSDC',  color: '#FFD200' },
  { symbol: 'cWETH',  color: '#FFD200' },
  { symbol: 'cZAMA',  color: '#FFD200' },
  { symbol: 'cBRON',  color: '#FFD200' },
  { symbol: 'cXAUt',  color: '#FFD200' },
];

export function Legend() {
  return (
    <div className="flex flex-col gap-3">
      {/* FHE description */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: '#FFD200', boxShadow: '0 0 6px 1px rgba(255,210,0,0.35)' }}
          />
          <span className="font-mono text-[10px] tracking-wider uppercase font-medium" style={{ color: '#FFD200' }}>
            FHE Encrypted Ledger
          </span>
        </div>
        <p className="font-mono text-[9px] text-white/30 pl-4 leading-relaxed">
          Amounts hidden via FHE. Shield/Unshield visible on-chain.
        </p>
      </div>

      {/* Node types */}
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[8px] text-white/20 tracking-widest uppercase font-medium">Nodes</span>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
              style={{ borderColor: '#FFD200', boxShadow: '0 0 6px 2px rgba(255,210,0,0.4)' }}
            >
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#FFD200' }} />
            </div>
            <span className="font-mono text-[9px]" style={{ color: '#FFD200' }}>cTOKEN — Zama wrapper</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#FFD200', opacity: 0.45 }} />
            <span className="font-mono text-[9px] text-white/40">Wallet address</span>
          </div>
        </div>
      </div>

      {/* Edge types */}
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[8px] text-white/20 tracking-widest uppercase font-medium">Transactions</span>
        <div className="flex flex-col gap-1.5">
          {TX_TYPES.map((t) => (
            <div key={t.label} className="flex items-center gap-2">
              <div className="flex items-center gap-1 flex-shrink-0">
                <div className="w-4 h-px" style={{ backgroundColor: t.color }} />
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
              </div>
              <div>
                <span className="font-mono text-[9px] font-medium" style={{ color: t.color }}>{t.label}</span>
                <span className="font-mono text-[8px] text-white/25 ml-1">{t.subLabel}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Token chips */}
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[8px] text-white/20 tracking-widest uppercase font-medium">Tokens</span>
        <div className="flex flex-wrap gap-1">
          {TOKEN_PILLS.map((t) => (
            <span
              key={t.symbol}
              className="font-mono text-[8px] px-2 py-0.5 rounded border"
              style={{
                borderColor: 'rgba(255,210,0,0.3)',
                color: '#FFD200',
                backgroundColor: 'rgba(255,210,0,0.05)',
              }}
            >
              {t.symbol}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
