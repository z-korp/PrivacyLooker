'use client';

import { useRef, useCallback, useEffect, useMemo } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { forceCollide } from 'd3-force-3d';
import { GraphNode, GraphLink } from '@/types/graph';
import { getExtrudedLogoGeometry, TOKEN_COLOR } from '@/lib/tokenLogos';
import { useTransactions } from '@/hooks/useTransactions';
import { useAppStore } from '@/store/appStore';

interface Props {
  width: number;
  height: number;
}

// ── Fixed palette — always FHE / avec-zama ─────────────────────────────────
const EDGE_COLORS = {
  wrap:     { link: '#4ade80', particle: '#86efac' },   // Shield: green
  unwrap:   { link: '#f87171', particle: '#fca5a5' },   // Unshield: red
  transfer: { link: '#FFD200', particle: '#FFE566' },
} as const;

const THEME = {
  background:     '#000000',
  walletColor:    '#FFD200',
  walletHubColor: '#ffe566',
  ringColor:      '#FFD200',
  glowColor:      0xffd200,
  labelColor:     '#FFD200',
  particleCount:  1,   // 1 per link — many individual links now
  particleWidth:  1.8,
} as const;

// ── Pre-allocated THREE materials for node reuse ───────────────────────────
const MAT_WALLET     = new THREE.MeshBasicMaterial({ color: THEME.walletColor });
const MAT_HUB        = new THREE.MeshBasicMaterial({ color: THEME.walletHubColor });
const MAT_GLOW_INNER = new THREE.MeshBasicMaterial({ color: THEME.glowColor, transparent: true, opacity: 0.20, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false });
const MAT_GLOW_OUTER = new THREE.MeshBasicMaterial({ color: THEME.glowColor, transparent: true, opacity: 0.05, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false });

// Per-token phong materials (lit → depth shading on extruded faces)
const _logoMatCache = new Map<string, THREE.MeshPhongMaterial>();
function getLogoMat(symbol: string): THREE.MeshPhongMaterial {
  if (_logoMatCache.has(symbol)) return _logoMatCache.get(symbol)!;
  const col  = TOKEN_COLOR[symbol] ?? THEME.glowColor;
  const mat  = new THREE.MeshPhongMaterial({
    color:     col,
    emissive:  new THREE.Color(col).multiplyScalar(0.18),
    shininess: 80,
    specular:  new THREE.Color(0x888888),
  });
  _logoMatCache.set(symbol, mat);
  return mat;
}

// ── THREE.js node factory (materials reused, only geometries allocated) ────
function buildNodeObject(node: GraphNode): THREE.Object3D {
  const group = new THREE.Group();

  if (node.isWrapperContract) {
    const sym    = node.tokenSymbol ?? '';
    const outerR = 6 + node.val * 0.55;     // 3D world radius (~9-13 units)
    const depth  = outerR * 0.7;            // extrusion depth proportional to size

    // ── Extruded token logo ──────────────────────────────────────────────────
    // Shapes live in ±50 space — scale them down to fit our outerR
    const logoScale = outerR / 50;
    const geom = getExtrudedLogoGeometry(sym, depth);
    const mesh = new THREE.Mesh(geom, getLogoMat(sym));
    mesh.scale.set(logoScale, logoScale, 1);
    group.add(mesh);

    // Soft volumetric glow behind the logo
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(outerR * 1.55, 10, 10),
      MAT_GLOW_OUTER,
    ));

    // Label
    const label = new SpriteText(`c${sym || '?'}`);
    label.color           = THEME.labelColor;
    label.textHeight      = outerR * 0.52;
    label.fontFace        = 'JetBrains Mono, monospace';
    label.fontWeight      = 'bold';
    label.backgroundColor = 'rgba(0,0,0,0.65)';
    label.padding         = 2;
    label.borderRadius    = 3;
    label.position.set(0, outerR + depth * 0.5 + 5, 0);
    group.add(label);

    return group;
  }

  const radius = 2 + node.val * 0.65;
  const mat    = node.isHub ? MAT_HUB : MAT_WALLET;
  group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 12), mat));
  group.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.6, 10, 10), MAT_GLOW_INNER));
  group.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 2.4, 8,  8),  MAT_GLOW_OUTER));

  return group;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const edgeColors = (link: GraphLink) =>
  EDGE_COLORS[link.eventType as keyof typeof EDGE_COLORS] ?? EDGE_COLORS.transfer;

function eventLabel(et: string) {
  if (et === 'wrap')         return '⬆ Shield';
  if (et === 'unwrap')       return '⬇ Unshield';
  if (et === 'confidential') return '🔒 Confidential';
  return 'Transfer';
}

// ── Main component ─────────────────────────────────────────────────────────
export default function ForceGraph3DWrapper({ width, height }: Props) {
  const setSelectedNode = useAppStore((s) => s.setSelectedNode);
  const setSelectedLink = useAppStore((s) => s.setSelectedLink);
  const setFgInstance   = useAppStore((s) => s.setFgInstance);

  const { graphData } = useTransactions();
  const fgRef       = useRef<any>(null);
  const hasZoomed   = useRef(false);

  // Register instance, lights, auto-rotate, and zoom-to-fit once physics settle
  const onEngineStop = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    setFgInstance(fg);

    // Ensure the scene has enough light for MeshPhongMaterial to show depth
    const scene = fg.scene();
    if (scene && !scene.userData.__lightsAdded) {
      scene.userData.__lightsAdded = true;
      const ambient = new THREE.AmbientLight(0xffffff, 0.6);
      const dir1    = new THREE.DirectionalLight(0xffffff, 1.0);
      dir1.position.set(200, 300, 200);
      const dir2    = new THREE.DirectionalLight(0x8888ff, 0.4);
      dir2.position.set(-200, -100, -200);
      scene.add(ambient, dir1, dir2);
    }

    const controls = fg.controls();
    if (controls) {
      controls.autoRotate      = true;
      controls.autoRotateSpeed = 0.35;
    }
    // Zoom to fit the whole graph the first time physics settle after new data
    if (!hasZoomed.current) {
      hasZoomed.current = true;
      fg.zoomToFit(900, 60);
    }
  }, [setFgInstance]);

  useEffect(() => () => setFgInstance(null), [setFgInstance]);

  // ── d3 force setup — delayed so the simulation is guaranteed to exist ─────
  useEffect(() => {
    if (graphData.nodes.length === 0) return;

    // Use a short timeout so ForceGraph3D has time to create the simulation
    // before we call d3Force() on it (avoids "Cannot read .tick of undefined")
    const t = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg) return;

      try {
        // Strong repulsion spreads wallet leaf nodes apart → organic web feel
        fg.d3Force('charge')?.strength((n: GraphNode) =>
          n.isWrapperContract ? -800 : -120
        );
        fg.d3Force('link')
          ?.distance((l: GraphLink) => l.eventType === 'wrap' ? 90 : 90)
          .strength(0.6);
        fg.d3Force('collision', forceCollide((n: GraphNode) =>
          n.isWrapperContract ? 30 + n.val * 1.5 : 6 + n.val
        ).strength(0.6));
        // No centering force — let clusters float freely
        fg.d3Force('center', null);
        fg.d3ReheatSimulation();
      } catch {
        // Simulation not ready yet — will settle naturally
      }
    }, 80);

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData.nodes.length, graphData.links.length]);

  // Reset zoom flag when the dataset changes (week / token filter applied)
  useEffect(() => {
    if (graphData.nodes.length > 0) {
      hasZoomed.current = false;
    }
  }, [graphData]);

  // Token labels are already the 'avec-zama' prefixed form in graphData
  const displayData = useMemo(() => graphData, [graphData]);

  // ── Callbacks — all stable, no deps on changing data ──────────────────────
  const nodeThreeObject = useCallback(
    (node: object) => buildNodeObject(node as GraphNode),
    [] // never changes — mode is constant
  );

  const nodeLabel = useCallback((node: object) => {
    const n = node as GraphNode;
    const isW = n.isWrapperContract;
    return `
      <div style="background:rgba(0,0,0,0.92);border:1px solid ${isW ? '#FFD200' : '#2a2a2a'};border-radius:6px;padding:8px 12px;font-family:monospace;font-size:11px;color:#fff;max-width:240px;">
        <div style="color:${isW ? '#FFD200' : '#aaa'};font-weight:bold;margin-bottom:4px;">${isW ? `c${n.tokenSymbol} Wrapper` : 'Wallet'}</div>
        <div style="word-break:break-all;color:#888;font-size:9px;">${n.address}</div>
        <div style="margin-top:5px;display:flex;gap:12px;">
          <div style="color:#444;font-size:9px;">Txns: <span style="color:#fff;">${n.txCount}</span></div>
        </div>
        ${isW ? '<div style="margin-top:4px;color:#FFD200;font-size:9px;">● Zama FHE Contract</div>' : ''}
      </div>`;
  }, []);

  const linkLabel = useCallback((link: object) => {
    const l = link as GraphLink;
    const isConf = l.eventType === 'confidential';
    const { link: ec } = edgeColors(l);
    const from = typeof l.source === 'string' ? l.source : l.source.address;
    const to   = typeof l.target === 'string' ? l.target : l.target.address;

    const amountHtml = isConf
      ? `<span style="color:#c084fc;">🔒 FHE Encrypted</span>`
      : `<span style="color:#FFD200;">🔒 Encrypted</span>`;

    return `
      <div style="background:rgba(0,0,0,0.94);border:1px solid ${ec}44;border-radius:6px;padding:8px 12px;font-family:monospace;font-size:11px;color:#fff;max-width:260px;">
        <div style="color:${ec};font-weight:bold;font-size:13px;margin-bottom:2px;">${l.transformLabel}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="color:${ec};font-size:9px;opacity:0.7;">${eventLabel(l.eventType)}</span>
          ${(l.aggregatedCount ?? 1) > 1 ? `<span style="color:${ec};font-size:8px;padding:1px 5px;border:1px solid ${ec}44;border-radius:3px;">${l.aggregatedCount} txns</span>` : ''}
        </div>
        <div style="margin-bottom:4px;">${(l.aggregatedCount ?? 1) > 1 ? 'Total: ' : 'Amount: '}${amountHtml}</div>
        <div style="color:#444;font-size:9px;">${from.slice(0,12)}… → ${to.slice(0,12)}…</div>
        ${l.isLive ? `<div style="margin-top:5px;color:#4ade80;font-size:9px;">● Live · click to open Etherscan</div>` : ''}
      </div>`;
  }, []);

  const linkColor     = useCallback((l: object) => edgeColors(l as GraphLink).link,     []);
  const particleColor = useCallback((l: object) => edgeColors(l as GraphLink).particle, []);

  const linkWidth = useCallback((_l: object) => 0.5, []);

  const linkCurvature = useCallback(
    (l: object) => (l as GraphLink).curvature ?? 0.1, []
  );

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
  }, [setSelectedNode]);

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
  // Don't mount the WebGL renderer until we have real data —
  // an empty simulation causes "Cannot read .tick of undefined"
  if (graphData.nodes.length === 0) return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: '#FFD200', borderTopColor: 'transparent' }} />
        <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: '#FFD200' }}>
          Loading on-chain data…
        </span>
      </div>
    </div>
  );

  return (
    <ForceGraph3D
      ref={fgRef}
      graphData={displayData as any}
      width={width}
      height={height}
      backgroundColor={THEME.background}
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
      linkOpacity={0.85}
      linkCurvature={linkCurvature}
      linkLabel={linkLabel}
      // Particles
      linkDirectionalParticles={THEME.particleCount}
      linkDirectionalParticleSpeed={0.005}
      linkDirectionalParticleColor={particleColor}
      linkDirectionalParticleWidth={THEME.particleWidth}
      // Interaction
      onNodeClick={onNodeClick}
      onLinkClick={onLinkClick}
      onBackgroundClick={onBackgroundClick}
      onEngineStop={onEngineStop}
      // Physics — slow decay = smooth glide into place
      d3AlphaDecay={0.015}
      d3VelocityDecay={0.3}
      cooldownTicks={300}
      // preserveDrawingBuffer required for GIF canvas capture
      rendererConfig={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
    />
  );
}
