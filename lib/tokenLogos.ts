'use client';

/**
 * Token logo shapes for 3D extrusion.
 *
 * All shapes are defined in a ±50 coordinate space (100×100 centered at origin).
 * They are designed to look great when extruded with THREE.ExtrudeGeometry.
 *
 * Usage:
 *   const { shapes, color } = getTokenLogo('USDT');
 *   const geom = new THREE.ExtrudeGeometry(shapes, extrudeOpts);
 */

import * as THREE from 'three';

// ── Brand colours ─────────────────────────────────────────────────────────────
export const TOKEN_COLOR: Record<string, number> = {
  USDT: 0x26a17b,   // Tether green
  USDC: 0x2775ca,   // Circle blue
  WETH: 0x627eea,   // Ethereum indigo
  ZAMA: 0xffd200,   // Zama yellow
  BRON: 0xe8821d,   // Bronze/orange
  XAUt: 0xd4af37,   // Gold
  tGBP: 0x1a5fa8,   // Sterling blue
};

// ── Shape builders ────────────────────────────────────────────────────────────

/** Tether — bold T with thick horizontal cap */
function makeUSDT(): THREE.Shape[] {
  const s = new THREE.Shape();
  s.moveTo(-42, 28); s.lineTo( 42, 28);
  s.lineTo( 42, 12); s.lineTo( 11, 12);
  s.lineTo( 11,-38); s.lineTo(-11,-38);
  s.lineTo(-11, 12); s.lineTo(-42, 12);
  s.closePath();
  return [s];
}

/** USD Coin — thick ring / donut */
function makeUSDC(): THREE.Shape[] {
  const s = new THREE.Shape();
  s.absarc(0, 0, 43, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 21, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return [s];
}

/** Wrapped Ether — classic ETH diamond (upper + lower chevron) */
function makeWETH(): THREE.Shape[] {
  // Upper chevron
  const upper = new THREE.Shape();
  upper.moveTo(  0, 46);
  upper.lineTo(-34,  4);
  upper.lineTo(  0, -9);
  upper.lineTo( 34,  4);
  upper.closePath();

  // Lower chevron (slightly narrower for authentic ETH proportions)
  const lower = new THREE.Shape();
  lower.moveTo(  0, -9);
  lower.lineTo(-34,  4);
  lower.lineTo(  0,-46);
  lower.lineTo( 34,  4);
  lower.closePath();

  return [upper, lower];
}

/** ZAMA — bold Z with diagonal slash */
function makeZAMA(): THREE.Shape[] {
  const s = new THREE.Shape();
  s.moveTo(-42, 42);
  s.lineTo( 42, 42);
  s.lineTo( 42, 27);
  s.lineTo(-12,-27);
  s.lineTo( 42,-27);
  s.lineTo( 42,-42);
  s.lineTo(-42,-42);
  s.lineTo(-42,-27);
  s.lineTo( 12, 27);
  s.lineTo(-42, 27);
  s.closePath();
  return [s];
}

/** BRON — regular pentagon */
function makeBRON(): THREE.Shape[] {
  const s = new THREE.Shape();
  const r = 44;
  const start = -Math.PI / 2; // flat edge at bottom, point at top
  for (let i = 0; i < 5; i++) {
    const a = start + (i / 5) * Math.PI * 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else         s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return [s];
}

/** XAUt — gold bar (outer rectangle with inner window) */
function makeXAUt(): THREE.Shape[] {
  const s = new THREE.Shape();
  // Outer bar
  s.moveTo(-44,-22); s.lineTo( 44,-22);
  s.lineTo( 44, 22); s.lineTo(-44, 22);
  s.closePath();
  // Inner rectangular hole
  const hole = new THREE.Path();
  hole.moveTo(-28,-10); hole.lineTo( 28,-10);
  hole.lineTo( 28, 10); hole.lineTo(-28, 10);
  hole.closePath();
  s.holes.push(hole);
  return [s];
}

/** tGBP — stylised pound sign (£): arc head + descender + crossbar */
function makeTGBP(): THREE.Shape[] {
  const s = new THREE.Shape();

  // Start bottom-right of crossbar, trace counter-clockwise
  s.moveTo( 34,-14);
  s.lineTo(-34,-14);
  s.lineTo(-34,  0);   // up left edge of crossbar
  s.lineTo(-16,  0);   // inner left
  s.lineTo(-16, 24);   // up stem
  // Arc: left side of the bowl (from bottom-left of stem up and right)
  s.absarc( 6, 24, 22, Math.PI, 0, false);
  s.lineTo( 28, 24);
  s.lineTo( 28, 10);
  s.absarc( 6, 24, 10, 0, Math.PI, true);
  s.lineTo( -4, 24);
  s.lineTo( -4,  0);   // back down to crossbar level
  s.lineTo( 34,  0);
  s.closePath();
  return [s];
}

/** Fallback — regular hexagon */
function makeHexagon(): THREE.Shape[] {
  const s = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
    if (i === 0) s.moveTo(Math.cos(a) * 44, Math.sin(a) * 44);
    else         s.lineTo(Math.cos(a) * 44, Math.sin(a) * 44);
  }
  s.closePath();
  return [s];
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getTokenShapes(symbol: string): THREE.Shape[] {
  switch (symbol) {
    case 'USDT': return makeUSDT();
    case 'USDC': return makeUSDC();
    case 'WETH': return makeWETH();
    case 'ZAMA': return makeZAMA();
    case 'BRON': return makeBRON();
    case 'XAUt': return makeXAUt();
    case 'tGBP': return makeTGBP();
    default:     return makeHexagon();
  }
}

// ── Geometry cache (extruded shapes are expensive — reuse them) ───────────────
const _geomCache = new Map<string, THREE.BufferGeometry>();

export function getExtrudedLogoGeometry(
  symbol: string,
  depth: number,
): THREE.BufferGeometry {
  const key = `${symbol}::${depth.toFixed(2)}`;
  if (_geomCache.has(key)) return _geomCache.get(key)!;

  const shapes = getTokenShapes(symbol);
  const geom   = new THREE.ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled:    true,
    bevelThickness:  depth * 0.14,
    bevelSize:       depth * 0.10,
    bevelSegments:   4,
  });

  // Centre at origin (shapes live in ±50 space)
  geom.computeBoundingBox();
  const bb = geom.boundingBox!;
  geom.translate(
    -(bb.max.x + bb.min.x) / 2,
    -(bb.max.y + bb.min.y) / 2,
    -(bb.max.z + bb.min.z) / 2,
  );

  _geomCache.set(key, geom);
  return geom;
}
