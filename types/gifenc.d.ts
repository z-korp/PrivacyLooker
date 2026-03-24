// d3-force-3d ships ESM with no bundled types
declare module 'd3-force-3d' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function forceCollide(radius?: number | ((node: any) => number)): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function forceManyBody(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function forceLink(links?: any[]): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function forceCenter(x?: number, y?: number, z?: number): any;
}

declare module 'gifenc' {
  export interface GIFEncoderInstance {
    writeFrame(
      data: Uint8Array,
      width: number,
      height: number,
      opts?: {
        delay?: number;
        palette?: number[][];
        repeat?: number;
        transparent?: boolean;
        transparentIndex?: number;
        dispose?: number;
        colorDepth?: number;
      }
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
  }

  export function GIFEncoder(opts?: { initialCapacity?: number; auto?: boolean }): GIFEncoderInstance;

  export function quantize(
    data: Uint8ClampedArray | Uint8Array,
    maxColors: number,
    opts?: { format?: 'rgb565' | 'rgba4444' | 'rgb444' }
  ): number[][];

  export function applyPalette(
    data: Uint8ClampedArray | Uint8Array,
    palette: number[][],
    format?: string
  ): Uint8Array;
}
