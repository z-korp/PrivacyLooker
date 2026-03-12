'use client';

import { useRef, useCallback, useEffect, useMemo } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { GraphNode, GraphLink, PrivacyMode } from '@/types/graph';
import { useTransactions } from '@/hooks/useTransactions';
import { useAppStore } from '@/store/appStore';
import { toConfidential } from '@/lib/tokenConfig';

interface Props {
  width: number;
  height: number;
}

// ── Edge color palette (per event type × privacy mode) ───────────────────────
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
    walletNodeColor: '#ffffff',
    walletHubColor:  '#aaaaaa',
    contractRingColor: '#ffffff',
    contractGlowColor: 0xffffff,
    labelColor: '#ffffff',
    particleCount: 3,
    particleWidth: 1.8,
    glowEnabled: false,
  },
  'avec-zama': {
    background: '#000000',
    walletNodeColor: '#FFD200',
    walletHubColor:  '#ffe566',
    contractRingColor: '#FFD200',
    contractGlowColor: 0xffd200,
    labelColor: '#FFD200',
    particleCount: 4,
    particleWidth: 3,
    glowEnabled: true,
  },
} as const;

// ── THREE.js node factory ─────────────────────────────────────────────────────
function createNodeObject(node: GraphNode, mode: PrivacyMode): THREE.Object3D {
  const theme = THEME[mode];

  if (node.isWrapperContract) {
    // ── Wrapper contract: torus (ring) + floating label ────────────────────
    const group = new THREE.Group();
    const outerR = 5 + node.val * 0.5;   // 8–11 depending on TVS
    const tubeR  = outerR * 0.28;

    const torusGeo = new THREE.TorusGeometry(outerR, tubeR, 20, 60);
    const torusMat = new THREE.MeshBasicMaterial({ color: theme.contractRingColor });
    const torus = new THREE.Mesh(torusGeo, torusMat);
    // Tilt slightly for a 3D look when viewed from default camera
    torus.rotation.x = Math.PI / 3;
    group.add(torus);

    // Glow shell (Avec Zama only)
    if (theme.glowEnabled) {
      const glowGeo = new THREE.TorusGeometry(outerR * 1.4, tubeR * 1.3, 16, 40);
      const glowMat = new THREE.MeshBasicMaterial({
        color: theme.contractGlowColor,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glowTorus = new THREE.Mesh(glowGeo, glowMat);
      glowTorus.rotation.x = Math.PI / 3;
      group.add(glowTorus);
    }

    // Token label (always visible floating text)
    const label = new SpriteText(`c${node.tokenSymbol ?? '?'}`);
    label.color = theme.labelColor;
    label.textHeight = outerR * 0.55;
    label.fontFace = 'JetBrains Mono, monospace';
    label.fontWeight = 'bold';
    label.backgroundColor = 'rgba(0,0,0,0.6)';
    label.padding = 2;
    label.borderRadius = 3;
    // Position label above the torus
    label.position.set(0, outerR + tubeR + 3, 0);
    group.add(label);

    return group;
  }

  // ── Wallet node: sphere (+ glow in Avec Zama) ─────────────────────────────
  const group = new THREE.Group();
  const radius = 2 + node.val * 0.7;
  const color  = node.isHub ? theme.walletHubColor : theme.walletNodeColor;

  const coreGeo = new THREE.SphereGeometry(radius, 16, 16);
  const coreMat = new THREE.MeshBasicMaterial({ color });
  group.add(new THREE.Mesh(coreGeo, coreMat));

  if (theme.glowEnabled) {
    const innerGeo = new THREE.SphereGeometry(radius * 1.5, 16, 16);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xffd200,
      transparent: true, opacity: 0.22,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    group.add(new THREE.Mesh(innerGeo, innerMat));

    const outerGeo = new THREE.SphereGeometry(radius * 2.4, 12, 12);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xffd200,
      transparent: true, opacity: 0.06,
      side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    group.add(new THREE.Mesh(outerGeo, outerMat));
  }

  return group;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function resolveAddress(ep: string | GraphNode): string {
  return typeof ep === 'string' ? ep : ep.address;
}

function edgePalette(link: GraphLink, mode: PrivacyMode) {
  const p = EDGE_PALETTE[mode];
  const k = link.eventType as keyof typeof p;
  return p[k] ?? p.transfer;
}

function eventLabel(link: GraphLink): string {
  if (link.eventType === 'wrap')         return '⬆ Shield';
  if (link.eventType === 'unwrap')       return '⬇ Unshield';
  if (link.eventType === 'confidential') return '🔒 Confidential Transfer';
  return 'Transfer';
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ForceGraph3DWrapper({ width, height }: Props) {
  const privacyMode   = useAppStore((s) => s.privacyMode);
  const setSelectedNode = useAppStore((s) => s.setSelectedNode);
  const setSelectedLink = useAppStore((s) => s.setSelectedLink);

  const { graphData } = useTransactions();
  const fgRef  = useRef<any>(null);
  const theme  = THEME[privacyMode];

  // Prefix token names with "c" in Avec Zama mode
  const displayData = useMemo(() => {
    if (privacyMode === 'sans-zama') return graphData;
    return {
      nodes: graphData.nodes,
      links: graphData.links.map((l) => ({
        ...l,
        token: l.eventType === 'confidential' ? toConfidential(l.tokenBase) : toConfidential(l.tokenBase),
      })),
    };
  }, [graphData, privacyMode]);

  // Auto-fit camera when graph loads
  useEffect(() => {
    if (!fgRef.current || displayData.nodes.length === 0) return;
    const t = setTimeout(() => fgRef.current?.zoomToFit(700, 100), 1400);
    return () => clearTimeout(t);
  }, [displayData.nodes.length]);

  // ── Node rendering ─────────────────────────────────────────────────────────
  const nodeThreeObject = useCallback(
    (node: object) => createNodeObject(node as GraphNode, privacyMode),
    [privacyMode]
  );

  // ── Node tooltip ───────────────────────────────────────────────────────────
  const nodeLabel = useCallback(
    (node: object) => {
      const n = node as GraphNode;
      const isWrapper = n.isWrapperContract;
      const accent = isWrapper ? '#FFD200' : '#aaaaaa';
      const tvsStr = isWrapper && n.tvs
        ? `<div style="margin-top:4px;color:#888;font-size:10px;">TVS: <span style="color:#FFD200;">${(n.tvs / 1e6).toFixed(2)}M raw</span></div>`
        : '';
      return `
        <div style="background:rgba(0,0,0,0.9);border:1px solid ${isWrapper ? '#FFD200' : '#333'};border-radius:6px;padding:8px 12px;font-family:monospace;font-size:11px;color:#fff;max-width:220px;">
          <div style="color:${accent};font-weight:bold;margin-bottom:4px;">${isWrapper ? `c${n.tokenSymbol} Wrapper` : 'Wallet'}</div>
          <div style="word-break:break-all;color:#ccc;">${n.address}</div>
          <div style="margin-top:6px;color:#888;">Txns: <span style="color:#fff;">${n.txCount}</span></div>
          ${tvsStr}
          ${isWrapper ? '<div style="margin-top:4px;color:#FFD200;font-size:10px;">● Zama FHE Contract</div>' : ''}
        </div>
      `;
    },
    []
  );

  // ── Link tooltip ───────────────────────────────────────────────────────────
  const linkLabel = useCallback(
    (link: object) => {
      const l = link as GraphLink;
      const isConfidential = privacyMode === 'avec-zama' || l.eventType === 'confidential';
      const { link: edgeColor } = edgePalette(l, privacyMode);
      const from = resolveAddress(l.source);
      const to   = resolveAddress(l.target);
      const displayToken = privacyMode === 'avec-zama' ? toConfidential(l.tokenBase) : l.tokenBase;

      const amountHtml =
        l.eventType === 'confidential'
          ? `<span style="color:#c084fc;">🔒 FHE Encrypted — never knowable</span>`
          : isConfidential
          ? `<span style="color:#FFD200;">🔒 Encrypted</span>`
          : `${l.amountFormatted} ${l.tokenBase}`;

      return `
        <div style="background:rgba(0,0,0,0.92);border:1px solid ${edgeColor}55;border-radius:6px;padding:8px 12px;font-family:monospace;font-size:11px;color:#fff;max-width:250px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="color:${edgeColor};font-weight:bold;">${displayToken}</span>
            <span style="color:${edgeColor};">${eventLabel(l)}</span>
          </div>
          <div style="margin-bottom:4px;">Amount: ${amountHtml}</div>
          <div style="color:#555;font-size:10px;">From: ${from.slice(0, 10)}…</div>
          <div style="color:#555;font-size:10px;">To: ${to.slice(0, 10)}…</div>
          ${l.isLive ? `<div style="margin-top:6px;color:#4ade80;font-size:10px;">● Live · click to verify on Etherscan</div>` : ''}
        </div>
      `;
    },
    [privacyMode]
  );

  // ── Per-link color / particle callbacks ─────────────────────────────────────
  const linkColor     = useCallback((l: object) => edgePalette(l as GraphLink, privacyMode).link,     [privacyMode]);
  const particleColor = useCallback((l: object) => edgePalette(l as GraphLink, privacyMode).particle, [privacyMode]);

  const linkWidth = useCallback(
    (l: object) => {
      const link = l as GraphLink;
      const base = privacyMode === 'avec-zama' ? 0.7 : 0.5;
      if (link.eventType === 'confidential') return base * 0.8;  // slightly thinner, dashed feel
      return base + Math.min(link.amount / 1e10, 3) * 0.15;
    },
    [privacyMode]
  );

  const linkOpacity = useCallback(
    (l: object) => (l as GraphLink).eventType === 'confidential' ? 0.45 : 0.65,
    []
  );

  // Confidential transfers get a gentle curve to visually separate them from shield edges
  const linkCurvature = useCallback(
    (l: object) => (l as GraphLink).curvature ?? 0.1,
    []
  );

  // ── Interaction ────────────────────────────────────────────────────────────
  const onNodeClick = useCallback(
    (node: object) => {
      const n = node as GraphNode & { x?: number; y?: number; z?: number };
      setSelectedNode(n);
      if (fgRef.current) {
        const dist = n.isWrapperContract ? 150 : 100;
        fgRef.current.cameraPosition(
          { x: (n.x ?? 0) + dist, y: (n.y ?? 0), z: (n.z ?? 0) + dist },
          { x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 },
          800
        );
      }
    },
    [setSelectedNode]
  );

  const onLinkClick = useCallback(
    (link: object) => {
      const l = link as GraphLink;
      setSelectedLink(l);
      if (l.isLive && l.txHash?.startsWith('0x') && l.txHash.length === 66) {
        window.open(`https://etherscan.io/tx/${l.txHash}`, '_blank', 'noopener,noreferrer');
      }
    },
    [setSelectedLink]
  );

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
      linkOpacity={0.65}
      linkCurvature={linkCurvature}
      linkLabel={linkLabel}
      // Particles
      linkDirectionalParticles={theme.particleCount}
      linkDirectionalParticleSpeed={0.004}
      linkDirectionalParticleColor={particleColor}
      linkDirectionalParticleWidth={theme.particleWidth}
      // Interaction
      onNodeClick={onNodeClick}
      onLinkClick={onLinkClick}
      onBackgroundClick={onBackgroundClick}
      // Physics — stronger centering force for star topology
      d3AlphaDecay={0.015}
      d3VelocityDecay={0.3}
      cooldownTicks={250}
      rendererConfig={{ antialias: true, alpha: false }}
    />
  );
}
