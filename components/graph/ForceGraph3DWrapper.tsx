'use client';

import { useRef, useCallback, useEffect, useMemo } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
// forceCollide is ESM-only — must be a top-level import (no require)
import { forceCollide } from 'd3-force-3d';
import { GraphNode, GraphLink, PrivacyMode } from '@/types/graph';
import { useTransactions } from '@/hooks/useTransactions';
import { useAppStore } from '@/store/appStore';
import { toConfidential } from '@/lib/tokenConfig';

interface Props {
  width: number;
  height: number;
}

// ── Color palette (edge type × privacy mode) ──────────────────────────────────
const EDGE_PALETTE = {
  'sans-zama': {
    wrap:         { link: '#22c55e', particle: '#4ade80' },
    unwrap:       { link: '#ef4444', particle: '#f87171' },
    confidential: { link: '#a78bfa', particle: '#c4b5fd' },
    transfer:     { link: '#444444', particle: '#666666' },
  },
  'avec-zama': {
    wrap:         { link: '#86efac', particle: '#bbf7d0' },
    unwrap:       { link: '#fca5a5', particle: '#fecaca' },
    confidential: { link: '#c084fc', particle: '#e9d5ff' },
    transfer:     { link: '#FFD200', particle: '#FFE566' },
  },
} as const;

const THEME = {
  'sans-zama': {
    background: '#000000',
    walletColor:   '#ffffff',
    walletHubColor:'#aaaaaa',
    ringColor:     '#ffffff',
    glowColor:     0xffffff,
    labelColor:    '#ffffff',
    particleCount: 3,
    particleWidth: 1.8,
    glowEnabled:   false,
  },
  'avec-zama': {
    background: '#000000',
    walletColor:   '#FFD200',
    walletHubColor:'#ffe566',
    ringColor:     '#FFD200',
    glowColor:     0xffd200,
    labelColor:    '#FFD200',
    particleCount: 4,
    particleWidth: 3,
    glowEnabled:   true,
  },
} as const;

// ── THREE.js node factory ─────────────────────────────────────────────────────
function buildNodeObject(node: GraphNode, mode: PrivacyMode): THREE.Object3D {
  const theme = THEME[mode];
  const group = new THREE.Group();

  if (node.isWrapperContract) {
    // Torus (ring) — visually distinct from wallet spheres
    const outerR = 6 + node.val * 0.55;
    const tubeR  = outerR * 0.26;

    const geo = new THREE.TorusGeometry(outerR, tubeR, 20, 64);
    const mat = new THREE.MeshBasicMaterial({ color: theme.ringColor });
    const torus = new THREE.Mesh(geo, mat);
    torus.rotation.x = Math.PI / 3.5;
    group.add(torus);

    if (theme.glowEnabled) {
      const gGeo = new THREE.TorusGeometry(outerR * 1.5, tubeR * 1.2, 14, 40);
      const gMat = new THREE.MeshBasicMaterial({
        color: theme.glowColor, transparent: true, opacity: 0.10,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const gTorus = new THREE.Mesh(gGeo, gMat);
      gTorus.rotation.x = Math.PI / 3.5;
      group.add(gTorus);
    }

    // Always-visible token label
    const label = new SpriteText(`c${node.tokenSymbol ?? '?'}`);
    label.color        = theme.labelColor;
    label.textHeight   = outerR * 0.52;
    label.fontFace     = 'JetBrains Mono, monospace';
    label.fontWeight   = 'bold';
    label.backgroundColor = 'rgba(0,0,0,0.65)';
    label.padding      = 2;
    label.borderRadius = 3;
    label.position.set(0, outerR + tubeR + 4, 0);
    group.add(label);

    return group;
  }

  // Wallet node — sphere
  const radius = 2 + node.val * 0.65;
  const color  = node.isHub ? theme.walletHubColor : theme.walletColor;
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 14, 14),
    new THREE.MeshBasicMaterial({ color })
  );
  group.add(sphere);

  if (theme.glowEnabled) {
    const addGlow = (r: number, op: number) => {
      group.add(new THREE.Mesh(
        new THREE.SphereGeometry(r, 12, 12),
        new THREE.MeshBasicMaterial({
          color: 0xffd200, transparent: true, opacity: op,
          side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
        })
      ));
    };
    addGlow(radius * 1.6, 0.22);
    addGlow(radius * 2.6, 0.06);
  }

  return group;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const palette = (link: GraphLink, mode: PrivacyMode) => {
  const p = EDGE_PALETTE[mode];
  return p[link.eventType as keyof typeof p] ?? p.transfer;
};

function eventLabel(et: string) {
  if (et === 'wrap')         return '⬆ Shield';
  if (et === 'unwrap')       return '⬇ Unshield';
  if (et === 'confidential') return '🔒 Confidential Transfer';
  return 'Transfer';
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ForceGraph3DWrapper({ width, height }: Props) {
  const privacyMode     = useAppStore((s) => s.privacyMode);
  const setSelectedNode = useAppStore((s) => s.setSelectedNode);
  const setSelectedLink = useAppStore((s) => s.setSelectedLink);
  const setFgInstance   = useAppStore((s) => s.setFgInstance);

  const { graphData } = useTransactions();
  const fgRef       = useRef<any>(null);
  const hasZoomed   = useRef(false);   // zoom-to-fit only on first load
  const theme       = THEME[privacyMode];

  // Register instance + enable auto-rotation once physics first settles
  const onEngineStop = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    setFgInstance(fg);
    // Gentle ambient rotation — makes the 3D space feel alive
    const controls = fg.controls();
    if (controls) {
      controls.autoRotate      = true;
      controls.autoRotateSpeed = 0.35;
    }
  }, [setFgInstance]);

  useEffect(() => () => setFgInstance(null), [setFgInstance]);

  // ── d3 force customization ────────────────────────────────────────────────
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    // Moderate repulsion — strong enough to separate nodes, not so strong it oscillates
    fg.d3Force('charge')?.strength(-260);

    // Longer links for shield/unshield (wallet ↔ wrapper), shorter for confidential
    fg.d3Force('link')
      ?.distance((link: GraphLink) => link.eventType === 'confidential' ? 70 : 130)
      .strength((link: GraphLink) => link.eventType === 'confidential' ? 0.2 : 0.6);

    fg.d3Force('collision', forceCollide((n: GraphNode) => {
      if (n.isWrapperContract) return 28 + n.val * 2;
      return 9 + n.val * 1.4;
    }).strength(0.8));

    fg.d3Force('center', null);
    fg.d3ReheatSimulation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData.nodes.length, graphData.links.length]);

  // Auto-fit camera — once on first load only, so live refreshes don't jolt the view
  useEffect(() => {
    if (!fgRef.current || graphData.nodes.length === 0 || hasZoomed.current) return;
    hasZoomed.current = true;
    const t = setTimeout(() => fgRef.current?.zoomToFit(1400, 120), 1800);
    return () => clearTimeout(t);
  }, [graphData.nodes.length]);

  // Apply "avec zama" token name prefix
  const displayData = useMemo(() => {
    if (privacyMode === 'sans-zama') return graphData;
    return {
      nodes: graphData.nodes,
      links: graphData.links.map((l) => ({ ...l, token: toConfidential(l.tokenBase) })),
    };
  }, [graphData, privacyMode]);

  // ── Node THREE object ──────────────────────────────────────────────────────
  const nodeThreeObject = useCallback(
    (node: object) => buildNodeObject(node as GraphNode, privacyMode),
    [privacyMode]
  );

  // ── Node tooltip ───────────────────────────────────────────────────────────
  const nodeLabel = useCallback((node: object) => {
    const n = node as GraphNode;
    const isW = n.isWrapperContract;
    return `
      <div style="background:rgba(0,0,0,0.92);border:1px solid ${isW ? '#FFD200' : '#333'};border-radius:6px;padding:8px 12px;font-family:monospace;font-size:11px;color:#fff;max-width:230px;">
        <div style="color:${isW ? '#FFD200' : '#aaa'};font-weight:bold;margin-bottom:4px;">${isW ? `c${n.tokenSymbol} Wrapper` : 'Wallet'}</div>
        <div style="word-break:break-all;color:#ccc;font-size:9px;">${n.address}</div>
        <div style="margin-top:5px;color:#666;font-size:9px;">Txns: <span style="color:#fff;">${n.txCount}</span></div>
        ${isW ? '<div style="margin-top:3px;color:#FFD200;font-size:9px;">● Zama FHE Contract</div>' : ''}
      </div>`;
  }, []);

  // ── Link tooltip ───────────────────────────────────────────────────────────
  const linkLabel = useCallback((link: object) => {
    const l = link as GraphLink;
    const isConf = l.eventType === 'confidential';
    const { link: ec } = palette(l, privacyMode);
    const from  = typeof l.source === 'string' ? l.source : l.source.address;
    const to    = typeof l.target === 'string' ? l.target : l.target.address;

    const amountHtml = isConf
      ? `<span style="color:#c084fc;">🔒 FHE Encrypted</span>`
      : privacyMode === 'avec-zama'
        ? `<span style="color:#FFD200;">🔒 Encrypted</span>`
        : `${l.amountFormatted} ${l.tokenBase}`;

    return `
      <div style="background:rgba(0,0,0,0.94);border:1px solid ${ec}44;border-radius:6px;padding:8px 12px;font-family:monospace;font-size:11px;color:#fff;max-width:260px;">
        <div style="color:${ec};font-weight:bold;font-size:13px;margin-bottom:2px;letter-spacing:0.02em;">${l.transformLabel}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="color:${ec};font-size:9px;opacity:0.7;">${eventLabel(l.eventType)}</span>
          ${l.aggregatedCount > 1 ? `<span style="color:${ec};font-size:8px;padding:1px 5px;border:1px solid ${ec}44;border-radius:3px;">${l.aggregatedCount} txns</span>` : ''}
        </div>
        <div style="margin-bottom:4px;">${l.aggregatedCount > 1 ? 'Total: ' : 'Amount: '}${amountHtml}</div>
        <div style="color:#444;font-size:9px;">${from.slice(0,12)}… → ${to.slice(0,12)}…</div>
        ${l.isLive ? `<div style="margin-top:5px;color:#4ade80;font-size:9px;">● Live · click to open Etherscan</div>` : ''}
      </div>`;
  }, [privacyMode]);

  // ── Per-link style callbacks ───────────────────────────────────────────────
  const linkColor     = useCallback((l: object) => palette(l as GraphLink, privacyMode).link,     [privacyMode]);
  const particleColor = useCallback((l: object) => palette(l as GraphLink, privacyMode).particle, [privacyMode]);

  const linkWidth = useCallback((l: object) => {
    const link = l as GraphLink;
    const base = privacyMode === 'avec-zama' ? 0.75 : 0.45;
    if (link.eventType === 'confidential') return base * 0.8;
    // Log-scale on aggregated count so heavily-used pairs are visually thicker
    const countBoost = Math.log2((link.aggregatedCount ?? 1) + 1) * 0.55;
    return Math.min(base + countBoost, base * 6);
  }, [privacyMode]);

  const linkCurvature = useCallback(
    (l: object) => (l as GraphLink).curvature ?? 0.1,
    []
  );

  // ── Interaction ────────────────────────────────────────────────────────────
  const onNodeClick = useCallback((node: object) => {
    const n = node as GraphNode & { x?: number; y?: number; z?: number };
    setSelectedNode(n);
    const fg = fgRef.current;
    if (fg) {
      const dist = n.isWrapperContract ? 160 : 110;
      fg.cameraPosition(
        { x: (n.x ?? 0) + dist, y: (n.y ?? 0) + 30, z: (n.z ?? 0) + dist },
        { x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 },
        1200
      );
    }
  }, [setSelectedNode]);  // fgRef is a stable ref, no need to list it

  const onLinkClick = useCallback((link: object) => {
    const l = link as GraphLink;
    setSelectedLink(l);
    if (l.isLive && l.txHash?.startsWith('0x') && l.txHash.length === 66) {
      window.open(`https://etherscan.io/tx/${l.txHash}`, '_blank', 'noopener,noreferrer');
    }
  }, [setSelectedLink]);

  const onBackgroundClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedLink(null);
  }, [setSelectedNode, setSelectedLink]);

  if (width === 0 || height === 0) return null;

  return (
    <ForceGraph3D
      ref={fgRef}
      graphData={displayData as any}
      width={width}
      height={height}
      backgroundColor={theme.background}
      // Nodes
      nodeId="id"
      nodeVal="val"
      nodeThreeObject={nodeThreeObject}
      nodeThreeObjectExtend={false}
      nodeLabel={nodeLabel}
      nodeOpacity={1}
      // Links
      linkSource="source"
      linkTarget="target"
      linkColor={linkColor}
      linkWidth={linkWidth}
      linkOpacity={0.7}
      linkCurvature={linkCurvature}
      linkLabel={linkLabel}
      // Particles
      linkDirectionalParticles={theme.particleCount}
      linkDirectionalParticleSpeed={0.005}
      linkDirectionalParticleColor={particleColor}
      linkDirectionalParticleWidth={theme.particleWidth}
      // Interaction
      onNodeClick={onNodeClick}
      onLinkClick={onLinkClick}
      onBackgroundClick={onBackgroundClick}
      onEngineStop={onEngineStop}
      // Physics — slow decay + strong damping = nodes glide smoothly into place
      d3AlphaDecay={0.007}
      d3VelocityDecay={0.38}
      cooldownTicks={600}
      // preserveDrawingBuffer required for GIF canvas capture
      rendererConfig={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
    />
  );
}
