export interface TokenConfig {
  symbol: string;
  address: string;
  decimals: number;
  color: string;  // accent color for this token in tooltips
}

export const TOKENS: TokenConfig[] = [
  {
    symbol: 'USDC',
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    decimals: 6,
    color: '#2775CA',
  },
  {
    symbol: 'USDT',
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    decimals: 6,
    color: '#26A17B',
  },
  {
    symbol: 'WETH',
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    decimals: 18,
    color: '#627EEA',
  },
  {
    symbol: 'BRON',
    address: '0xce3ab8cf6cc3ce65df37f9431ba8c28cd76049b9',
    decimals: 18,
    color: '#E5A020',
  },
  {
    symbol: 'ZAMA',
    address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
    decimals: 6,
    color: '#FFD200',
  },
  {
    symbol: 'tGBP',
    address: '0x00000000441378008EA67F4284A57932B1c000a5',
    decimals: 18,
    color: '#CF1020',
  },
  {
    symbol: 'XAUt',
    address: '0x68749665FF8D2d112Fa859AA851F5dCac3D16F4e',
    decimals: 6,
    color: '#C9A84C',
  },
];

export const TOKEN_MAP: Record<string, TokenConfig> = Object.fromEntries(
  TOKENS.map((t) => [t.address.toLowerCase(), t])
);

/** Wraps a token symbol with the confidential prefix for Avec Zama mode */
export function toConfidential(symbol: string): string {
  return `c${symbol}`;
}

/** Returns a stable mock address string for display */
export function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Format a raw token amount given its decimals */
export function formatTokenAmount(raw: bigint | number, decimals: number): string {
  const divisor = Math.pow(10, decimals);
  const value = Number(raw) / divisor;
  if (value === 0) return '0';
  if (value < 0.01) return '<0.01';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}
