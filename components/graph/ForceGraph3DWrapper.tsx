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
  wrap:     { link: '#22ff66', particle: '#66ffaa' },   // Shield: bright green
  unwrap:   { link: '#ff4444', particle: '#ff8888' },   // Unshield: bright red
  transfer: { link: '#FFD200', particle: '#FFE566' },
} as const;

const THEME = {
  background:     '#000000',
  walletColor:    '#FFD200',
  walletHubColor: '#ffe566',
  ringColor:      '#FFD200',
  glowColor:      0xffd200,
  labelColor:     '#FFD200',
  particleWidth:  2.5,
} as const;

// ── Pre-allocated THREE materials (allocated once, reused everywhere) ────────
const MAT_WALLET = new THREE.MeshStandardMaterial({
  color: THEME.walletColor,
  metalness: 0.3,
  roughness: 0.4,
  emissive: new THREE.Color(THEME.walletColor).multiplyScalar(0.15),
});
const MAT_HUB = new THREE.MeshStandardMaterial({
  color: THEME.walletHubColor,
  metalness: 0.3,
  roughness: 0.4,
  emissive: new THREE.Color(THEME.walletHubColor).multiplyScalar(0.15),
});
// Tight core glow (close to surface, visible halo)
const MAT_GLOW_INNER = new THREE.MeshBasicMaterial({ color: THEME.glowColor, transparent: true, opacity: 0.15, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false });
// Wide soft halo (atmospheric glow)
const MAT_GLOW_OUTER = new THREE.MeshBasicMaterial({ color: THEME.glowColor, transparent: true, opacity: 0.03, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false });

// ── Geometry cache — quantized radii → shared SphereGeometry instances ──────
// (OPT 1: geometry reuse — avoids allocating new geometry per node)
const _sphereGeoCache = new Map<string, THREE.SphereGeometry>();

function getSphereGeo(radius: number, wSeg: number, hSeg: number): THREE.SphereGeometry {
  const qr = Math.round(radius * 2) / 2;  // quantize to nearest 0.5
  const key = `${qr}_${wSeg}_${hSeg}`;
  let geo = _sphereGeoCache.get(key);
  if (!geo) {
    geo = new THREE.SphereGeometry(qr, wSeg, hSeg);
    _sphereGeoCache.set(key, geo);
  }
  return geo;
}

function disposeGeoCache() {
  _sphereGeoCache.forEach(g => g.dispose());
  _sphereGeoCache.clear();
}

// ── Invisible hitbox for wallet nodes (raycaster target only) ───────────────
// (OPT 2: wallet visuals rendered via InstancedMesh; this handles hover/click)
const HITBOX_GEO = new THREE.SphereGeometry(1, 4, 4);
const HITBOX_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

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

// ── THREE.js node factory ───────────────────────────────────────────────────
// Wrapper contracts → extruded logo + cached glow sphere (few nodes, full detail)
// Wallet nodes     → invisible hitbox only; InstancedMesh handles the visual
function buildNodeObject(node: GraphNode): THREE.Object3D {
  if (node.isWrapperContract) {
    const group = new THREE.Group();
    const sym    = node.tokenSymbol ?? '';
    const outerR = 6 + node.val * 0.55;
    const depth  = outerR * 0.7;

    // ── Extruded token logo ────────────────────────────────────────────────
    const logoScale = outerR / 50;
    const geom = getExtrudedLogoGeometry(sym, depth);
    const mesh = new THREE.Mesh(geom, getLogoMat(sym));
    mesh.scale.set(logoScale, logoScale, 1);
    group.add(mesh);

    // Inner core glow — tight, visible halo
    group.add(new THREE.Mesh(
      getSphereGeo(outerR * 1.2, 8, 8),
      MAT_GLOW_INNER,
    ));
    // Outer atmospheric glow — wide, soft
    group.add(new THREE.Mesh(
      getSphereGeo(outerR * 2.0, 8, 8),
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

  // ── Wallet node — invisible hitbox scaled to outer glow radius ───────────
  // (OPT 2: InstancedMesh draws the actual spheres; this is for interaction)
  const radius = 2 + node.val * 0.65;
  const hitbox = new THREE.Mesh(HITBOX_GEO, HITBOX_MAT);
  hitbox.scale.setScalar(radius * 3.0);
  return hitbox;
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

// ── Particle threshold — disable when many links to avoid particle spam ─────
// (OPT 5)
const PARTICLE_LINK_THRESHOLD = 80;

// ── Main component ─────────────────────────────────────────────────────────
export default function ForceGraph3DWrapper({ width, height }: Props) {
  const setSelectedNode = useAppStore((s) => s.setSelectedNode);
  const setSelectedLink = useAppStore((s) => s.setSelectedLink);
  const setFgInstance   = useAppStore((s) => s.setFgInstance);

  const { graphData } = useTransactions();
  const fgRef       = useRef<any>(null);
  const hasZoomed   = useRef(false);

  // ── InstancedMesh state for wallet nodes (OPT 2) ─────────────────────────
  const instanceRef = useRef<{
    core: THREE.InstancedMesh | null;
    glowInner: THREE.InstancedMesh | null;
    glowOuter: THREE.InstancedMesh | null;
    walletNodes: GraphNode[];
    animId: number;
  }>({ core: null, glowInner: null, glowOuter: null, walletNodes: [], animId: 0 });

  // Register instance, lights, auto-rotate, and zoom-to-fit once physics settle
  const onEngineStop = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    setFgInstance(fg);

    // Ensure the scene has enough light for MeshStandardMaterial metalness
    const scene = fg.scene();
    if (scene && !scene.userData.__lightsAdded) {
      scene.userData.__lightsAdded = true;
      // Deep-space ambient: subtle blue-purple hemisphere
      const hemi = new THREE.HemisphereLight(0x4444ff, 0x000022, 0.3);
      const ambient = new THREE.AmbientLight(0xffffff, 0.5);
      const dir1    = new THREE.DirectionalLight(0xffffff, 1.2);
      dir1.position.set(200, 300, 200);
      const dir2    = new THREE.DirectionalLight(0x8888ff, 0.5);
      dir2.position.set(-200, -100, -200);
      scene.add(hemi, ambient, dir1, dir2);

      // Sky dome — subtle dark-blue background instead of pure black
      const skyGeo = new THREE.SphereGeometry(3000, 16, 12);
      const skyMat = new THREE.MeshBasicMaterial({ color: 0x060612, side: THREE.BackSide });
      scene.add(new THREE.Mesh(skyGeo, skyMat));
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

    const t = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg) return;

      try {
        fg.d3Force('charge')?.strength((n: GraphNode) =>
          n.isWrapperContract ? -800 : -120
        );
        fg.d3Force('link')
          ?.distance((_l: GraphLink) => 90)
          .strength(0.6);
        fg.d3Force('collision', forceCollide((n: GraphNode) =>
          n.isWrapperContract ? 30 + n.val * 1.5 : 6 + n.val
        ).strength(0.6));
        fg.d3Force('center', null);
        fg.d3ReheatSimulation();
      } catch {
        // Simulation not ready yet — will settle naturally
      }
    }, 80);

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData.nodes.length, graphData.links.length]);

  // ── InstancedMesh setup — 3 draw calls for ALL wallet spheres (OPT 2) ────
  useEffect(() => {
    if (graphData.nodes.length === 0) return;

    const setupTimer = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg) return;
      const scene = fg.scene();
      if (!scene) return;

      const inst = instanceRef.current;

      // Tear down previous instances
      cancelAnimationFrame(inst.animId);
      [inst.core, inst.glowInner, inst.glowOuter].forEach(m => {
        if (m) { scene.remove(m); m.geometry.dispose(); }
      });

      const walletNodes = graphData.nodes.filter(n => !n.isWrapperContract);
      inst.walletNodes = walletNodes;
      const count = walletNodes.length;
      if (count === 0) return;

      // Unit-sphere InstancedMeshes — scaled per instance via matrix
      // OPT 3: 8,8 for core (reduced from 12,12), 6,6 for glow (reduced from 10,10 / 8,8)
      // OPT 7: LOD — wallets are small, fewer segments suffice
      inst.core = new THREE.InstancedMesh(
        new THREE.SphereGeometry(1, 8, 8), MAT_WALLET, count
      );
      inst.glowInner = new THREE.InstancedMesh(
        new THREE.SphereGeometry(1, 6, 6), MAT_GLOW_INNER, count
      );
      inst.glowOuter = new THREE.InstancedMesh(
        new THREE.SphereGeometry(1, 6, 6), MAT_GLOW_OUTER, count
      );

      // Instances span the whole graph — skip per-instance frustum culling
      inst.core.frustumCulled = false;
      inst.glowInner.frustumCulled = false;
      inst.glowOuter.frustumCulled = false;

      scene.add(inst.core, inst.glowInner, inst.glowOuter);

      // Sync instance transforms from node positions every frame
      const dummy = new THREE.Object3D();
      let frame = 0;

      function sync() {
        frame++;
        // OPT 6: after ~10s at 60fps (initial layout done), sync every 2nd frame
        if (frame > 600 && frame % 2 !== 0) {
          inst.animId = requestAnimationFrame(sync);
          return;
        }

        for (let i = 0; i < walletNodes.length; i++) {
          const n = walletNodes[i] as any;
          const x = n.x ?? 0, y = n.y ?? 0, z = n.z ?? 0;
          const r = 2 + (n.val ?? 1.5) * 0.65;

          dummy.position.set(x, y, z);
          dummy.scale.setScalar(r);
          dummy.updateMatrix();
          inst.core!.setMatrixAt(i, dummy.matrix);

          dummy.scale.setScalar(r * 1.2);
          dummy.updateMatrix();
          inst.glowInner!.setMatrixAt(i, dummy.matrix);

          dummy.scale.setScalar(r * 3.0);
          dummy.updateMatrix();
          inst.glowOuter!.setMatrixAt(i, dummy.matrix);
        }

        inst.core!.instanceMatrix.needsUpdate = true;
        inst.glowInner!.instanceMatrix.needsUpdate = true;
        inst.glowOuter!.instanceMatrix.needsUpdate = true;

        // Slowly rotate wrapper hub logo meshes for a living feel
        const wrapperNodes = graphData.nodes.filter(n => n.isWrapperContract);
        for (const wn of wrapperNodes) {
          const obj = (wn as any).__threeObj as THREE.Object3D | undefined;
          if (obj) obj.rotation.y += 0.002;
        }

        inst.animId = requestAnimationFrame(sync);
      }

      sync();
    }, 120); // wait for ForceGraph3D to create the scene

    return () => {
      clearTimeout(setupTimer);
      cancelAnimationFrame(instanceRef.current.animId);
    };
  }, [graphData]);

  // ── Full cleanup on unmount (OPT 4) ──────────────────────────────────────
  useEffect(() => {
    return () => {
      const inst = instanceRef.current;
      cancelAnimationFrame(inst.animId);
      [inst.core, inst.glowInner, inst.glowOuter].forEach(m => {
        if (m) m.geometry.dispose();
      });
      inst.core = null;
      inst.glowInner = null;
      inst.glowOuter = null;
      disposeGeoCache();
    };
  }, []);

  // Reset zoom flag when the dataset changes (week / token filter applied)
  useEffect(() => {
    if (graphData.nodes.length > 0) {
      hasZoomed.current = false;
    }
  }, [graphData]);

  // Token labels are already the 'avec-zama' prefixed form in graphData
  const displayData = useMemo(() => graphData, [graphData]);

  // ── OPT 5: disable particles when link count exceeds threshold ───────────
  const particleCount = useMemo(
    () => graphData.links.length > PARTICLE_LINK_THRESHOLD ? 0 : 1,
    [graphData.links.length]
  );

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

  const linkWidth = useCallback((_l: object) => 0.8, []);

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
      // Particles — OPT 5: conditional on link count
      linkDirectionalParticles={particleCount}
      linkDirectionalParticleSpeed={(l: object) =>
        (l as GraphLink).eventType === 'wrap' ? 0.008 : 0.004
      }
      linkDirectionalParticleColor={particleColor}
      linkDirectionalParticleWidth={THEME.particleWidth}
      // Interaction
      onNodeClick={onNodeClick}
      onLinkClick={onLinkClick}
      onBackgroundClick={onBackgroundClick}
      onEngineStop={onEngineStop}
      // Physics — OPT 6: faster convergence (higher decay, fewer ticks)
      d3AlphaDecay={0.025}
      d3VelocityDecay={0.3}
      cooldownTicks={150}
      // preserveDrawingBuffer required for GIF canvas capture
      rendererConfig={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
    />
  );
}
