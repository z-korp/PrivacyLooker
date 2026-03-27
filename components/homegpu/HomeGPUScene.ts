/**
 * HomeGPUScene — WebGPU force-directed graph matching the homepage visual.
 *
 * Uses d3-force-3d for physics layout (same library as react-force-graph-3d)
 * and Three.js WebGPURenderer for rendering.
 *
 * Visual parity with ForceGraph3DWrapper:
 *   - Hub nodes: colored spheres with glow + SpriteText labels
 *   - Wallet nodes: small spheres with subtle glow
 *   - Links: colored lines (green=shield, red=unshield) with flowing particles
 *   - Force physics: charge repulsion + link attraction + collision avoidance
 *   - Auto-rotating camera via OrbitControls
 */

import {
  WebGPURenderer,
  Scene,
  PerspectiveCamera,
  Color,
  AmbientLight,
  DirectionalLight,
  Mesh,
  SphereGeometry,
  MeshBasicMaterial,
  MeshPhongMaterial,
  BufferGeometry,
  LineBasicMaterial,
  Line,
  Float32BufferAttribute,
  Group,
  Object3D,
  AdditiveBlending,
  BackSide,
} from 'three/webgpu';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import SpriteText from 'three-spritetext';
// @ts-expect-error — d3-force-3d has no types, installed as transitive dep
import { forceSimulation, forceManyBody, forceLink, forceCollide } from 'd3-force-3d';
import type { GraphData, GraphNode } from '@/types/graph';

// ── Token colors (matches TOKEN_COLOR in lib/tokenLogos.ts) ─────────────────

const TOKEN_HEX: Record<string, number> = {
  USDT: 0x26a17b,
  USDC: 0x2775ca,
  WETH: 0x627eea,
  ZAMA: 0xffd200,
  BRON: 0xe8821d,
  XAUt: 0xd4af37,
  tGBP: 0x1a5fa8,
};
const DEFAULT_HUB_COLOR = 0xffd200;
const WALLET_COLOR = 0xffd200;
const BG = new Color(0x000000);

// Edge colors by event type
const EDGE_COLORS: Record<string, number> = {
  wrap: 0x4ade80,
  unwrap: 0xf87171,
  transfer: 0xffd200,
  confidential: 0xc084fc,
};
const PARTICLE_COLORS: Record<string, number> = {
  wrap: 0x86efac,
  unwrap: 0xfca5a5,
  transfer: 0xffe566,
  confidential: 0xd8b4fe,
};

// ── Shared materials (allocated once) ───────────────────────────────────────

const MAT_WALLET = new MeshBasicMaterial({ color: WALLET_COLOR });
const MAT_GLOW_INNER = new MeshBasicMaterial({
  color: 0xffd200, transparent: true, opacity: 0.15,
  side: BackSide, blending: AdditiveBlending, depthWrite: false,
});
const MAT_GLOW_OUTER = new MeshBasicMaterial({
  color: 0xffd200, transparent: true, opacity: 0.04,
  side: BackSide, blending: AdditiveBlending, depthWrite: false,
});

// Per-token hub materials (cached)
const _hubMatCache = new Map<string, MeshPhongMaterial>();
function getHubMat(symbol: string): MeshPhongMaterial {
  if (_hubMatCache.has(symbol)) return _hubMatCache.get(symbol)!;
  const col = TOKEN_HEX[symbol] ?? DEFAULT_HUB_COLOR;
  const mat = new MeshPhongMaterial({
    color: col, emissive: col, emissiveIntensity: 0.2,
    shininess: 80, specular: 0x888888,
  });
  _hubMatCache.set(symbol, mat);
  return mat;
}

// ── Shared geometries ───────────────────────────────────────────────────────

const GEO_WALLET = new SphereGeometry(1, 8, 8);
const GEO_GLOW_INNER = new SphereGeometry(1, 6, 6);
const GEO_GLOW_OUTER = new SphereGeometry(1, 6, 6);
const GEO_PARTICLE = new SphereGeometry(1, 4, 4);

// ── Types for simulation ────────────────────────────────────────────────────

interface SimNode extends GraphNode {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  index?: number;
  // Three.js objects attached to this node
  __obj?: Object3D;
  __label?: SpriteText;
}

interface SimLink {
  source: SimNode;
  target: SimNode;
  eventType: string;
  __line?: Line;
  __particle?: Mesh;
  __particleT?: number; // 0..1 progress along link
}

// ── Scene class ─────────────────────────────────────────────────────────────

export class HomeGPUScene {
  private renderer!: WebGPURenderer;
  private scene!: Scene;
  private camera!: PerspectiveCamera;
  private controls!: OrbitControls;
  private container: HTMLElement | null = null;
  private disposed = false;

  // Scene groups
  private nodeGroup = new Group();
  private linkGroup = new Group();
  private particleGroup = new Group();
  private labelGroup = new Group();

  // d3-force simulation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private simulation: any = null;
  private simNodes: SimNode[] = [];
  private simLinks: SimLink[] = [];
  private simSettled = false;
  private simTickCount = 0;

  async init(container: HTMLElement): Promise<void> {
    this.container = container;
    const w = container.clientWidth;
    const h = container.clientHeight;

    // ── Renderer ──────────────────────────────────────────────────────────
    const renderer = new WebGPURenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(BG, 1);
    container.appendChild(renderer.domElement);
    await renderer.init();
    this.renderer = renderer;

    // ── Scene ─────────────────────────────────────────────────────────────
    const scene = new Scene();
    scene.background = BG;
    this.scene = scene;

    // ── Camera ────────────────────────────────────────────────────────────
    const camera = new PerspectiveCamera(60, w / h, 0.1, 2000);
    camera.position.set(0, 80, 200);
    this.camera = camera;

    // ── Controls ──────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.minDistance = 20;
    controls.maxDistance = 600;
    this.controls = controls;

    // ── Lights ────────────────────────────────────────────────────────────
    scene.add(new AmbientLight(0xffffff, 0.6));
    const dir1 = new DirectionalLight(0xffffff, 1.0);
    dir1.position.set(200, 300, 200);
    scene.add(dir1);
    const dir2 = new DirectionalLight(0x8888ff, 0.4);
    dir2.position.set(-200, -100, -200);
    scene.add(dir2);

    // ── Scene groups ─────────────────────────────────────────────────────
    scene.add(this.linkGroup);
    scene.add(this.particleGroup);
    scene.add(this.nodeGroup);
    scene.add(this.labelGroup);

    // ── Render loop ──────────────────────────────────────────────────────
    renderer.setAnimationLoop(() => {
      if (this.disposed) return;
      this.controls.update();
      this.tickSimulation();
      this.syncPositions();
      this.animateParticles();
      this.renderer.render(this.scene, this.camera);
    });
  }

  // ── Force simulation tick (runs until settled) ─────────────────────────

  private tickSimulation(): void {
    if (!this.simulation || this.simSettled) return;
    this.simulation.tick();
    this.simTickCount++;
    if (this.simulation.alpha() < 0.01) {
      this.simSettled = true;
      this.zoomToFit();
    }
  }

  // ── Sync Three.js objects to simulation positions ─────────────────────

  private syncPositions(): void {
    // Nodes
    for (const node of this.simNodes) {
      if (node.__obj) {
        node.__obj.position.set(node.x, node.y, node.z);
        if (node.isWrapperContract) {
          node.__obj.rotation.y += 0.003;
        }
      }
      if (node.__label) {
        const r = node.isWrapperContract ? this.hubRadius(node) : 2;
        node.__label.position.set(node.x, node.y + r + 5, node.z);
      }
    }

    // Links — update line endpoints
    for (const link of this.simLinks) {
      if (!link.__line) continue;
      const pos = link.__line.geometry.getAttribute('position');
      if (!pos) continue;
      const arr = pos.array as Float32Array;
      arr[0] = link.source.x; arr[1] = link.source.y; arr[2] = link.source.z;
      arr[3] = link.target.x; arr[4] = link.target.y; arr[5] = link.target.z;
      pos.needsUpdate = true;
    }
  }

  // ── Animate particles along links ─────────────────────────────────────

  private animateParticles(): void {
    for (const link of this.simLinks) {
      if (!link.__particle) continue;
      const speed = link.eventType === 'wrap' ? 0.008 : 0.005;
      link.__particleT = ((link.__particleT ?? 0) + speed) % 1;
      const t = link.__particleT;
      const p = link.__particle;
      p.position.set(
        link.source.x + (link.target.x - link.source.x) * t,
        link.source.y + (link.target.y - link.source.y) * t,
        link.source.z + (link.target.z - link.source.z) * t,
      );
    }
  }

  // ── Zoom camera to fit all nodes ──────────────────────────────────────

  private zoomToFit(): void {
    if (this.simNodes.length === 0) return;
    let maxR = 0;
    for (const n of this.simNodes) {
      const r = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
      if (r > maxR) maxR = r;
    }
    const dist = maxR * 2.2 + 60;
    this.camera.position.set(dist * 0.5, dist * 0.35, dist * 0.7);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  // ── Hub radius helper ─────────────────────────────────────────────────

  private hubRadius(node: GraphNode): number {
    return 6 + node.val * 0.55;
  }

  // ── Update from graph data ─────────────────────────────────────────────

  updateData(graphData: GraphData): void {
    const { nodes, links } = graphData;
    if (nodes.length === 0) return;

    // ── Tear down previous ───────────────────────────────────────────────
    this.simulation?.stop();
    this.clearGroup(this.nodeGroup);
    this.clearGroup(this.linkGroup);
    this.clearGroup(this.particleGroup);
    this.clearGroup(this.labelGroup);
    this.simSettled = false;
    this.simTickCount = 0;

    // ── Build simulation nodes ───────────────────────────────────────────
    this.simNodes = nodes.map((n) => ({
      ...n,
      x: (Math.random() - 0.5) * 100,
      y: (Math.random() - 0.5) * 100,
      z: (Math.random() - 0.5) * 100,
      vx: 0, vy: 0, vz: 0,
    }));

    const nodeById = new Map<string, SimNode>();
    for (const sn of this.simNodes) nodeById.set(sn.id, sn);

    // ── Build simulation links ───────────────────────────────────────────
    this.simLinks = [];
    for (const link of links) {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      const src = nodeById.get(sourceId);
      const tgt = nodeById.get(targetId);
      if (!src || !tgt) continue;
      this.simLinks.push({
        source: src,
        target: tgt,
        eventType: link.eventType,
      });
    }

    // ── Create Three.js objects for nodes ────────────────────────────────
    for (const node of this.simNodes) {
      if (node.isWrapperContract) {
        this.createHubVisual(node);
      } else {
        this.createWalletVisual(node);
      }
    }

    // ── Create Three.js objects for links + particles ────────────────────
    for (const link of this.simLinks) {
      this.createLinkVisual(link);
      this.createParticleVisual(link);
    }

    // ── Start d3-force-3d simulation ─────────────────────────────────────
    this.simulation = forceSimulation(this.simNodes, 3)
      .force('charge', forceManyBody()
        .strength((n: SimNode) => n.isWrapperContract ? -800 : -120))
      .force('link', forceLink(this.simLinks)
        .distance(90)
        .strength(0.6))
      .force('collision', forceCollide()
        .radius((n: SimNode) => n.isWrapperContract ? 30 + n.val * 1.5 : 6 + n.val)
        .strength(0.6))
      .alphaDecay(0.015)
      .velocityDecay(0.3)
      .stop(); // we tick manually in the render loop
  }

  // ── Visual builders ───────────────────────────────────────────────────

  private createHubVisual(node: SimNode): void {
    const group = new Group();
    const sym = node.tokenSymbol ?? '';
    const outerR = this.hubRadius(node);

    // Core sphere
    const coreMesh = new Mesh(new SphereGeometry(outerR, 16, 16), getHubMat(sym));
    group.add(coreMesh);

    // Inner glow
    const gi = new Mesh(new SphereGeometry(outerR * 1.4, 10, 10), MAT_GLOW_INNER);
    group.add(gi);

    // Outer glow
    const go = new Mesh(new SphereGeometry(outerR * 2.0, 8, 8), MAT_GLOW_OUTER);
    group.add(go);

    this.nodeGroup.add(group);
    node.__obj = group;

    // Label
    const label = new SpriteText(`c${sym || '?'}`);
    label.color = '#FFD200';
    label.textHeight = outerR * 0.52;
    label.fontFace = 'JetBrains Mono, monospace';
    label.fontWeight = 'bold';
    label.backgroundColor = 'rgba(0,0,0,0.65)';
    label.padding = 2;
    label.borderRadius = 3;
    this.labelGroup.add(label);
    node.__label = label;
  }

  private createWalletVisual(node: SimNode): void {
    const group = new Group();
    const radius = 2 + node.val * 0.65;

    // Core
    const core = new Mesh(GEO_WALLET, MAT_WALLET);
    core.scale.setScalar(radius);
    group.add(core);

    // Inner glow
    const gi = new Mesh(GEO_GLOW_INNER, MAT_GLOW_INNER);
    gi.scale.setScalar(radius * 1.6);
    group.add(gi);

    // Outer glow
    const go = new Mesh(GEO_GLOW_OUTER, MAT_GLOW_OUTER);
    go.scale.setScalar(radius * 2.4);
    group.add(go);

    this.nodeGroup.add(group);
    node.__obj = group;
  }

  private createLinkVisual(link: SimLink): void {
    const lineColor = EDGE_COLORS[link.eventType] ?? 0xffd200;
    const positions = new Float32Array(6); // 2 points × 3 components
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const mat = new LineBasicMaterial({
      color: lineColor, transparent: true, opacity: 0.6,
    });
    const line = new Line(geo, mat);
    this.linkGroup.add(line);
    link.__line = line;
  }

  private createParticleVisual(link: SimLink): void {
    const color = PARTICLE_COLORS[link.eventType] ?? 0xffe566;
    const mat = new MeshBasicMaterial({
      color, transparent: true, opacity: 0.8,
    });
    const mesh = new Mesh(GEO_PARTICLE, mat);
    mesh.scale.setScalar(1.2);
    this.particleGroup.add(mesh);
    link.__particle = mesh;
    link.__particleT = Math.random(); // random start offset
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private clearGroup(group: Group): void {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      this.disposeObject(child);
    }
  }

  private disposeObject(obj: Object3D): void {
    if (obj instanceof Mesh) {
      // Don't dispose shared geometries
      if (obj.geometry !== GEO_WALLET && obj.geometry !== GEO_GLOW_INNER &&
          obj.geometry !== GEO_GLOW_OUTER && obj.geometry !== GEO_PARTICLE) {
        obj.geometry.dispose();
      }
      // Don't dispose shared materials
      if (!Array.isArray(obj.material)) {
        if (obj.material !== MAT_WALLET && obj.material !== MAT_GLOW_INNER &&
            obj.material !== MAT_GLOW_OUTER && !_hubMatCache.has(obj.material.uuid ?? '')) {
          obj.material.dispose();
        }
      }
    }
    if (obj instanceof Line) {
      obj.geometry.dispose();
      if (!Array.isArray(obj.material)) obj.material.dispose();
    }
    if (obj.children) {
      [...obj.children].forEach((c) => this.disposeObject(c));
    }
  }

  resize(w: number, h: number): void {
    if (!this.renderer) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose(): void {
    this.disposed = true;
    this.simulation?.stop();
    this.renderer?.setAnimationLoop(null);
    this.controls?.dispose();
    this.clearGroup(this.nodeGroup);
    this.clearGroup(this.linkGroup);
    this.clearGroup(this.particleGroup);
    this.clearGroup(this.labelGroup);
    this.renderer?.dispose();
    if (this.container && this.renderer?.domElement) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
