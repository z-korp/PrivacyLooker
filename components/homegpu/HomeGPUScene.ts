/**
 * HomeGPUScene — WebGPU force-directed graph matching the homepage visual.
 *
 * Uses d3-force-3d for physics layout (same library as react-force-graph-3d)
 * and Three.js WebGPURenderer for rendering.
 *
 * Features:
 *   - Hub nodes: extruded 3D token logos + SpriteText labels
 *   - Wallet nodes: small spheres
 *   - Links: curved bezier lines with flowing particles
 *   - Force physics: charge repulsion + link attraction + collision
 *   - Interactivity: hover tooltips, click-to-zoom, drag nodes, click links
 */

import {
  WebGPURenderer,
  PostProcessing,

  Scene,
  PerspectiveCamera,
  Color,
  AmbientLight,
  DirectionalLight,
  Mesh,
  SphereGeometry,
  MeshBasicNodeMaterial,
  MeshPhongNodeMaterial,
  BufferGeometry,
  LineBasicNodeMaterial,
  Line,
  Float32BufferAttribute,
  Group,
  Object3D,
  Vector2,
  Vector3,
  Plane,
  Raycaster,
  BackSide,
  AdditiveBlending,

  // Starfield
  Points,
  PointsNodeMaterial,
} from 'three/webgpu';

import {
  uniform as tslUniform,
  pass,
  bloom,
  Fn,
  float,
  vec2,
  vec3,
  vec4,
  viewportUV,
  hash,
  timerGlobal,
} from 'three/tsl';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import SpriteText from 'three-spritetext';
// @ts-expect-error — d3-force-3d has no types, installed as transitive dep
import { forceSimulation, forceManyBody, forceLink, forceCollide, forceCenter } from 'd3-force-3d';
import type { GraphData, GraphNode, GraphLink } from '@/types/graph';
import { getExtrudedLogoGeometry } from '@/lib/tokenLogos';

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
  unwrap: 0xff6666,
  transfer: 0xffd200,
  confidential: 0xc084fc,
};
const PARTICLE_COLORS: Record<string, number> = {
  wrap: 0x86efac,
  unwrap: 0xfca5a5,
  transfer: 0xffe566,
  confidential: 0xd8b4fe,
};

// ── Shared materials (WebGPU node materials — compile directly to WGSL) ─────

const MAT_WALLET = new MeshBasicNodeMaterial({ color: WALLET_COLOR });

// Glow pulse uniform — updated once per frame, shared across all glow shells
const _glowTime = tslUniform(0);

// Shared materials that must survive clearGroup disposal cycles
const _sharedMats = new Set<object>([MAT_WALLET]);

// Per-token hub materials (cached)
const _hubMatCache = new Map<string, MeshPhongNodeMaterial>();
function getHubMat(symbol: string): MeshPhongNodeMaterial {
  if (_hubMatCache.has(symbol)) return _hubMatCache.get(symbol)!;
  const col = TOKEN_HEX[symbol] ?? DEFAULT_HUB_COLOR;
  const mat = new MeshPhongNodeMaterial({
    color: col, emissive: col, emissiveIntensity: 0.2,
    shininess: 80, specular: 0x888888,
  });
  _hubMatCache.set(symbol, mat);
  _sharedMats.add(mat);
  return mat;
}

// Per-token glow shell materials (cached — TSL-animated opacity)
const _glowMatCache = new Map<string, MeshBasicNodeMaterial>();
function getGlowMat(symbol: string): MeshBasicNodeMaterial {
  if (_glowMatCache.has(symbol)) return _glowMatCache.get(symbol)!;
  const col = TOKEN_HEX[symbol] ?? DEFAULT_HUB_COLOR;
  const mat = new MeshBasicNodeMaterial({
    color: col, transparent: true, depthWrite: false, side: BackSide,
  });
  // GPU-driven pulsing opacity via TSL: 0.12 ± 0.04
  mat.opacityNode = _glowTime.mul(2.0).sin().mul(0.04).add(0.12);
  _glowMatCache.set(symbol, mat);
  _sharedMats.add(mat);
  return mat;
}

// Per-event-type particle materials (cached — only 4 types)
const _particleMatCache = new Map<string, MeshBasicNodeMaterial>();
function getParticleMat(eventType: string): MeshBasicNodeMaterial {
  if (_particleMatCache.has(eventType)) return _particleMatCache.get(eventType)!;
  const color = PARTICLE_COLORS[eventType] ?? 0xffe566;
  const mat = new MeshBasicNodeMaterial({ color, transparent: true, opacity: 0.8 });
  _particleMatCache.set(eventType, mat);
  _sharedMats.add(mat);
  return mat;
}

// Per-event-type link materials (cached — only 4 types)
const _linkMatCache = new Map<string, LineBasicNodeMaterial>();
function getLinkMat(eventType: string): LineBasicNodeMaterial {
  if (_linkMatCache.has(eventType)) return _linkMatCache.get(eventType)!;
  const c = EDGE_COLORS[eventType] ?? 0xffd200;
  const mat = new LineBasicNodeMaterial({ color: c, transparent: true, opacity: 0.85 });
  _linkMatCache.set(eventType, mat);
  _sharedMats.add(mat);
  return mat;
}


// ── Shared geometries ───────────────────────────────────────────────────────

const GEO_WALLET = new SphereGeometry(1, 8, 8);
const GEO_PARTICLE = new SphereGeometry(1, 4, 4);
const GEO_GLOW = new SphereGeometry(1, 12, 12);

const GEO_HIGHLIGHT = new SphereGeometry(1, 16, 16);
const MAT_HIGHLIGHT = new MeshBasicNodeMaterial({
  color: 0xffd200, transparent: true, opacity: 0.3,
  blending: AdditiveBlending, depthWrite: false,
});
_sharedMats.add(MAT_HIGHLIGHT);

// Pre-allocated fallback vector for cross-product edge cases
const _FALLBACK_UP = new Vector3(0, 0, 1);

// ── Types ───────────────────────────────────────────────────────────────────

interface SimNode extends Omit<GraphNode, 'fx' | 'fy' | 'fz'> {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  fx?: number | null; fy?: number | null; fz?: number | null;
  index?: number;
  __obj?: Object3D;
  __label?: SpriteText;
  __baseScale?: number;
  /** Pulse intensity (1 = just hit, decays to 0) — triggered by particle arrival */
  __pulse?: number;
}

interface SimLink {
  source: SimNode;
  target: SimNode;
  eventType: string;
  curvature: number;
  // Original graph link data for tooltips
  graphLink?: GraphLink;
  __line?: Line;
  __particle?: Mesh;
  __particleT?: number;
  __origColor?: number;
}

export interface SceneCallbacks {
  onSelectNode: (node: GraphNode | null) => void;
  onSelectLink: (link: GraphLink | null) => void;
}

// ── Scene class ─────────────────────────────────────────────────────────────

export class HomeGPUScene {
  private renderer!: WebGPURenderer;
  private postProcessing!: PostProcessing;
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

  // O(1) node lookup by id (rebuilt on each updateData)
  private nodeById = new Map<string, SimNode>();

  // Pre-allocated vectors for zero-allocation hot paths
  private _dragIntersection = new Vector3();
  private _samplePt = new Vector3();

  // Hover highlight sphere (reused, repositioned on hover)
  private highlightMesh = new Mesh(GEO_HIGHLIGHT, MAT_HIGHLIGHT);

  // ── Interaction state ──────────────────────────────────────────────────
  private raycaster = new Raycaster();
  private mouse = new Vector2();
  private objToNode = new Map<Object3D, SimNode>();
  private hoveredNode: SimNode | null = null;
  private dragNode: SimNode | null = null;
  private isDragging = false;
  private dragPlane = new Plane();
  private tooltipEl: HTMLDivElement | null = null;
  private callbacks: SceneCallbacks | null = null;

  // Camera fly-to animation
  private flyTarget: { pos: Vector3; lookAt: Vector3; frames: number } | null = null;
  private flyFrom: { pos: Vector3; lookAt: Vector3 } | null = null;
  private flyFrame = 0;

  // Focused node orbit state
  private focusedNodeId: string | null = null;
  private focusOrbitAngle = 0;

  setCallbacks(cb: SceneCallbacks): void {
    this.callbacks = cb;
  }

  /**
   * Focus camera on a specific wrapper contract node (by id).
   * Pass null to reset to the default overview.
   */
  focusOnNode(nodeId: string | null): void {
    if (nodeId === null) {
      // Reset to overview — compute bounding sphere of all nodes
      this.focusedNodeId = null;
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = 0.35;

      let maxR = 0;
      for (const n of this.simNodes) {
        const r = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
        if (r > maxR) maxR = r;
      }
      const radius = Math.max(maxR, 30);
      const target = new Vector3(0, 0, 0);
      const camPos = new Vector3(0, radius * 1.5, radius * 3);
      this.startFlyTo(camPos, target);
      return;
    }

    const node = this.nodeById.get(nodeId);
    if (!node) return;

    this.focusedNodeId = nodeId;
    this.focusOrbitAngle = 0;

    // Calculate bounding radius of the cluster (logo + connected wallets)
    let maxR = 0;
    for (const link of this.simLinks) {
      const peer =
        link.source.id === nodeId ? link.target :
        link.target.id === nodeId ? link.source : null;
      if (!peer) continue;
      const dx = peer.x - node.x;
      const dy = peer.y - node.y;
      const dz = peer.z - node.z;
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (r > maxR) maxR = r;
    }
    const dist = Math.max(50, maxR * 2.5);

    // Fly to orbit position around the node
    const target = new Vector3(node.x, node.y, node.z);
    const camPos = new Vector3(
      node.x + dist * 0.6,
      node.y + dist * 0.35,
      node.z + dist * 0.6,
    );
    this.startFlyTo(camPos, target);

    // After fly completes, autoRotate will orbit around the new target
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.8;
  }

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
    const camera = new PerspectiveCamera(75, w / h, 0.1, 5000);
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

    // ── Hover highlight mesh (invisible until hover) ────────────────────
    this.highlightMesh.visible = false;
    scene.add(this.highlightMesh);

    // ── Starfield background ──────────────────────────────────────────────
    this.createStarfield(scene);

    // ── Post-processing: bloom + vignette ─────────────────────────────────
    const postProcessing = new PostProcessing(renderer);
    const scenePass = pass(scene, camera);
    const sceneColor = scenePass.getTextureNode('output');

    // Bloom — makes emissive/bright objects glow
    const bloomPass = bloom(sceneColor);
    bloomPass.threshold.value = 0.4;
    bloomPass.strength.value = 0.8;
    bloomPass.radius.value = 0.4;

    // Vignette — darken corners for cinematic feel
    const vignette = Fn(() => {
      const uv = viewportUV;
      const dist = uv.sub(0.5).length();
      return float(1.0).sub(dist.mul(1.3)).clamp(0.3, 1.0);
    });

    // Combine: scene + bloom, then vignette
    postProcessing.outputNode = sceneColor.add(bloomPass).mul(vignette());
    this.postProcessing = postProcessing;

    // ── Tooltip ──────────────────────────────────────────────────────────
    this.createTooltip(container);

    // ── Event listeners ──────────────────────────────────────────────────
    const dom = renderer.domElement;
    dom.addEventListener('mousemove', this.onMouseMove);
    dom.addEventListener('click', this.onClick);
    dom.addEventListener('mousedown', this.onMouseDown);
    dom.addEventListener('mouseup', this.onMouseUp);

    // ── Render loop ──────────────────────────────────────────────────────
    renderer.setAnimationLoop(() => {
      if (this.disposed) return;
      // Update TSL glow uniform (drives all glow shell opacity on GPU)
      _glowTime.value = performance.now() * 0.001;
      this.controls.update();
      this.tickSimulation();
      this.syncPositions();
      this.animateParticles();
      this.animateFlyTo();
      this.updateFocusedOrbit();
      // Render through post-processing pipeline (bloom + vignette)
      this.postProcessing.render();
    });
  }

  // ── Starfield background ──────────────────────────────────────────────

  private createStarfield(scene: Scene): void {
    const COUNT = 2000;
    const positions = new Float32Array(COUNT * 3);
    const spread = 1500;

    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = (Math.random() - 0.5) * spread;
      positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));

    // TSL-driven twinkling stars
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mat = new PointsNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
      size: 2,
    }) as any;
    mat.colorNode = vec3(0.6, 0.65, 0.8);
    // Subtle twinkle per-star using hash of time
    mat.sizeNode = hash(float(0).add(timerGlobal().mul(0.05))).mul(1.5).add(0.5);
    mat.opacityNode = hash(float(0).add(timerGlobal().mul(0.15))).mul(0.4).add(0.1);

    const stars = new Points(geo, mat);
    stars.frustumCulled = false;
    scene.add(stars);
  }

  // ── Tooltip DOM element ────────────────────────────────────────────────

  private createTooltip(container: HTMLElement): void {
    const el = document.createElement('div');
    el.style.cssText = `
      position: absolute; pointer-events: none; z-index: 50;
      display: none; max-width: 260px;
      background: rgba(0,0,0,0.92); border: 1px solid #2a2a2a;
      border-radius: 6px; padding: 8px 12px;
      font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #fff;
    `;
    container.appendChild(el);
    this.tooltipEl = el;
  }

  private showTooltip(html: string, x: number, y: number): void {
    if (!this.tooltipEl) return;
    this.tooltipEl.innerHTML = html;
    this.tooltipEl.style.display = 'block';
    this.tooltipEl.style.left = `${x + 15}px`;
    this.tooltipEl.style.top = `${y + 15}px`;
  }

  private hideTooltip(): void {
    if (this.tooltipEl) this.tooltipEl.style.display = 'none';
  }

  // ── Node tooltip HTML (matches homepage) ───────────────────────────────

  private nodeTooltipHtml(n: SimNode): string {
    const isW = n.isWrapperContract;
    const borderColor = isW ? '#FFD200' : '#2a2a2a';
    const titleColor = isW ? '#FFD200' : '#aaa';
    const title = isW ? `c${n.tokenSymbol} Wrapper` : 'Wallet';
    return `
      <div style="border-color:${borderColor}">
        <div style="color:${titleColor};font-weight:bold;margin-bottom:4px">${title}</div>
        <div style="word-break:break-all;color:#888;font-size:9px">${n.address}</div>
        <div style="margin-top:5px;color:#444;font-size:9px">Txns: <span style="color:#fff">${n.txCount}</span></div>
        ${isW ? '<div style="margin-top:4px;color:#FFD200;font-size:9px">● Zama FHE Contract</div>' : ''}
      </div>`;
  }

  // ── Link tooltip HTML ──────────────────────────────────────────────────

  private linkTooltipHtml(link: SimLink): string {
    const gl = link.graphLink;
    if (!gl) return '';
    const ec = EDGE_COLORS[link.eventType] ?? 0xffd200;
    const ecHex = '#' + ec.toString(16).padStart(6, '0');
    const eventName = link.eventType === 'wrap' ? '⬆ Shield'
      : link.eventType === 'unwrap' ? '⬇ Unshield'
      : link.eventType === 'confidential' ? '🔒 Confidential' : 'Transfer';
    const from = typeof gl.source === 'string' ? gl.source : gl.source.address;
    const to = typeof gl.target === 'string' ? gl.target : gl.target.address;
    return `
      <div style="color:${ecHex};font-weight:bold;font-size:13px;margin-bottom:2px">${gl.transformLabel}</div>
      <div style="color:${ecHex};font-size:9px;opacity:0.7;margin-bottom:6px">${eventName}</div>
      <div style="margin-bottom:4px">Amount: <span style="color:#FFD200">🔒 Encrypted</span></div>
      <div style="color:#444;font-size:9px">${from.slice(0, 12)}… → ${to.slice(0, 12)}…</div>
      ${gl.isLive ? '<div style="margin-top:5px;color:#4ade80;font-size:9px">● Live · click to open Etherscan</div>' : ''}`;
  }

  // ── Mouse → NDC ────────────────────────────────────────────────────────

  private updateMouse(e: MouseEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  // ── Raycast nodes ─────────────────────────────────────────────────────

  private raycastNode(): SimNode | null {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    // Raycast against all node group children (groups containing meshes)
    const meshes: Object3D[] = [];
    for (const group of this.nodeGroup.children) {
      // Only add the first child (core mesh) for raycasting
      if (group.children.length > 0) meshes.push(group.children[0]);
    }
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;
    // Walk up to find the group, then map to SimNode
    let obj: Object3D | null = hits[0].object;
    while (obj && !this.objToNode.has(obj)) obj = obj.parent;
    return obj ? this.objToNode.get(obj) ?? null : null;
  }

  // ── Event handlers ────────────────────────────────────────────────────

  private onMouseMove = (e: MouseEvent): void => {
    this.updateMouse(e);
    const rect = this.renderer.domElement.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;

    // ── Dragging ─────────────────────────────────────────────────────────
    if (this.isDragging && this.dragNode) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      this.raycaster.ray.intersectPlane(this.dragPlane, this._dragIntersection);
      this.dragNode.fx = this._dragIntersection.x;
      this.dragNode.fy = this._dragIntersection.y;
      this.dragNode.fz = this._dragIntersection.z;
      // Reheat simulation so surrounding nodes react
      if (this.simulation && this.simSettled) {
        this.simSettled = false;
        this.simulation.alpha(0.3).restart();
      }
      return;
    }

    // ── Hover ────────────────────────────────────────────────────────────
    const node = this.raycastNode();
    if (node !== this.hoveredNode) {
      // Unhover previous
      if (this.hoveredNode?.__obj) {
        const s = this.hoveredNode.__baseScale ?? 1;
        this.hoveredNode.__obj.scale.setScalar(s);
      }
      this.hoveredNode = node;
      // Hover new — scale up + show additive highlight sphere
      if (node?.__obj) {
        node.__baseScale = node.__obj.scale.x;
        node.__obj.scale.setScalar(node.__obj.scale.x * 1.2);

        const r = node.isWrapperContract ? this.hubRadius(node) * 1.8 : (2 + node.val * 0.65) * 2.5;
        this.highlightMesh.scale.setScalar(r);
        this.highlightMesh.position.set(node.x, node.y, node.z);
        this.highlightMesh.visible = true;
      } else {
        this.highlightMesh.visible = false;
      }
    }

    // Keep highlight tracking the hovered node's position
    if (this.hoveredNode) {
      this.highlightMesh.position.set(this.hoveredNode.x, this.hoveredNode.y, this.hoveredNode.z);
    }

    if (node) {
      this.showTooltip(this.nodeTooltipHtml(node), localX, localY);
      this.renderer.domElement.style.cursor = 'pointer';
    } else {
      this.hideTooltip();
      this.renderer.domElement.style.cursor = 'default';
    }
  };

  private onClick = (e: MouseEvent): void => {
    if (this.isDragging) return; // don't fire click after drag
    this.updateMouse(e);

    const node = this.raycastNode();
    if (node) {
      this.callbacks?.onSelectNode(node as unknown as GraphNode);
      // Fly camera to node
      const dist = node.isWrapperContract ? 40 : 25;
      const target = new Vector3(node.x, node.y, node.z);
      const camPos = new Vector3(
        node.x + dist, node.y + dist * 0.3, node.z + dist,
      );
      this.startFlyTo(camPos, target);
      return;
    }

    // Check link click — find closest link to ray
    const clickedLink = this.findClosestLink(5);
    if (clickedLink) {
      const gl = clickedLink.graphLink;
      this.callbacks?.onSelectLink(gl ?? null);
      if (gl?.isLive && gl.txHash?.startsWith('0x') && gl.txHash.length === 66) {
        window.open(`https://etherscan.io/tx/${gl.txHash}`, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    // Background click — deselect
    this.callbacks?.onSelectNode(null);
    this.callbacks?.onSelectLink(null);
  };

  private onMouseDown = (e: MouseEvent): void => {
    this.updateMouse(e);
    const node = this.raycastNode();
    if (!node) return;

    this.isDragging = true;
    this.dragNode = node;
    this.controls.enabled = false; // disable orbit during drag

    // Create a plane facing the camera at the node's position
    const nodePos = new Vector3(node.x, node.y, node.z);
    const camDir = new Vector3();
    this.camera.getWorldDirection(camDir);
    this.dragPlane.setFromNormalAndCoplanarPoint(camDir.negate(), nodePos);

    // Fix position in simulation
    node.fx = node.x;
    node.fy = node.y;
    node.fz = node.z;

    e.preventDefault();
  };

  private onMouseUp = (): void => {
    if (this.isDragging && this.dragNode) {
      // Release the fix — let the node float freely again
      this.dragNode.fx = null;
      this.dragNode.fy = null;
      this.dragNode.fz = null;
      this.dragNode = null;
    }
    this.isDragging = false;
    this.controls.enabled = true;
  };

  // ── Find closest link to ray (approximate — check midpoint distance) ──

  private findClosestLink(threshold: number): SimLink | null {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const ray = this.raycaster.ray;
    let best: SimLink | null = null;
    let bestDist = threshold;

    for (const link of this.simLinks) {
      // Sample a few points along the link and check ray distance
      const sx = link.source.x, sy = link.source.y, sz = link.source.z;
      const tx = link.target.x, ty = link.target.y, tz = link.target.z;
      for (const t of [0.25, 0.5, 0.75]) {
        this._samplePt.set(
          sx + (tx - sx) * t,
          sy + (ty - sy) * t,
          sz + (tz - sz) * t,
        );
        const d = ray.distanceToPoint(this._samplePt);
        if (d < bestDist) {
          bestDist = d;
          best = link;
        }
      }
    }
    return best;
  }

  // ── Camera fly-to animation ───────────────────────────────────────────

  private startFlyTo(pos: Vector3, lookAt: Vector3): void {
    this.flyFrom = {
      pos: this.camera.position.clone(),
      lookAt: this.controls.target.clone(),
    };
    this.flyTarget = { pos, lookAt, frames: 60 };
    this.flyFrame = 0;
    this.controls.enabled = false; // disable orbit during fly animation
  }

  private animateFlyTo(): void {
    if (!this.flyTarget || !this.flyFrom) return;
    this.flyFrame++;
    const t = Math.min(this.flyFrame / this.flyTarget.frames, 1);
    const ease = 1 - Math.pow(1 - t, 3);

    this.camera.position.lerpVectors(this.flyFrom.pos, this.flyTarget.pos, ease);
    this.controls.target.lerpVectors(this.flyFrom.lookAt, this.flyTarget.lookAt, ease);

    if (t >= 1) {
      this.controls.enabled = true; // re-enable orbit after fly completes
      this.controls.update();
      this.flyTarget = null;
      this.flyFrom = null;
    }
  }

  /** Keep the orbit target tracking the focused node's live position */
  private updateFocusedOrbit(): void {
    if (!this.focusedNodeId) return;
    const node = this.nodeById.get(this.focusedNodeId);
    if (!node) return;
    // Only track while NOT flying — the fly animation handles its own lerp
    if (this.flyTarget) return;
    this.controls.target.set(node.x, node.y, node.z);
  }

  // ── Force simulation tick ─────────────────────────────────────────────

  private tickSimulation(): void {
    if (!this.simulation || this.simSettled) return;
    this.simulation.tick();
    this.simTickCount++;
    if (this.simulation.alpha() < 0.01) {
      this.simSettled = true;
      this.focusOnNode(this.focusedNodeId);
    }
  }

  // ── Sync Three.js objects to simulation positions ─────────────────────

  private syncPositions(): void {
    for (const node of this.simNodes) {
      if (node.__obj) {
        node.__obj.position.set(node.x, node.y, node.z);
        if (node.isWrapperContract) {
          node.__obj.rotation.y += 0.003;
        }

        // Pulse effect: scale bump when particles arrive, decays smoothly
        const pulse = node.__pulse ?? 0;
        if (pulse > 0.001) {
          // Emissive glow boost only — no scale change
          if (node.isWrapperContract) {
            const logo = node.__obj.children[0] as Mesh;
            if (logo?.material && 'emissiveIntensity' in logo.material) {
              (logo.material as MeshPhongNodeMaterial).emissiveIntensity = 0.2 + pulse * 0.8;
            }
          }
          node.__pulse = pulse * 0.97; // slow decay (~100 frames to fade)
        } else if (node.__pulse !== undefined) {
          if (node.isWrapperContract) {
            const logo = node.__obj.children[0] as Mesh;
            if (logo?.material && 'emissiveIntensity' in logo.material) {
              (logo.material as MeshPhongNodeMaterial).emissiveIntensity = 0.2;
            }
          }
          node.__pulse = 0;
        }
      }
      if (node.__label) {
        const r = node.isWrapperContract ? this.hubRadius(node) : 2;
        node.__label.position.set(node.x, node.y + r + 5, node.z);
      }
    }

    // Links — update curved line points
    const _start = new Vector3();
    const _end = new Vector3();
    const _mid = new Vector3();
    const _vLine = new Vector3();
    const _perp = new Vector3();
    const _up = new Vector3(0, 1, 0);
    const _ctrl = new Vector3();

    for (const link of this.simLinks) {
      if (!link.__line) continue;
      const pos = link.__line.geometry.getAttribute('position');
      if (!pos) continue;

      _start.set(link.source.x, link.source.y, link.source.z);
      _end.set(link.target.x, link.target.y, link.target.z);
      _mid.addVectors(_start, _end).multiplyScalar(0.5);
      _vLine.subVectors(_end, _start);
      const lineLen = _vLine.length();

      _perp.crossVectors(_vLine, _up);
      if (_perp.lengthSq() < 0.001) _perp.crossVectors(_vLine, _FALLBACK_UP);
      _perp.normalize();

      _ctrl.copy(_mid).addScaledVector(_perp, link.curvature * lineLen);

      const numPts = HomeGPUScene.CURVE_SEGMENTS + 1;
      for (let i = 0; i < numPts; i++) {
        const t = i / HomeGPUScene.CURVE_SEGMENTS;
        const t1 = 1 - t;
        pos.setXYZ(i,
          t1 * t1 * _start.x + 2 * t1 * t * _ctrl.x + t * t * _end.x,
          t1 * t1 * _start.y + 2 * t1 * t * _ctrl.y + t * t * _end.y,
          t1 * t1 * _start.z + 2 * t1 * t * _ctrl.z + t * t * _end.z,
        );
      }
      pos.needsUpdate = true;
      link.__line.geometry.computeBoundingSphere();

    }
  }

  // ── Animate particles along curved links ──────────────────────────────

  private animateParticles(): void {
    const _s = new Vector3();
    const _e = new Vector3();
    const _m = new Vector3();
    const _v = new Vector3();
    const _p = new Vector3();
    const _up = new Vector3(0, 1, 0);
    const _c = new Vector3();
    const _pt = new Vector3();

    for (const link of this.simLinks) {
      if (!link.__particle) continue;
      const speed = link.eventType === 'wrap' ? 0.008 : 0.005;
      const prevT = link.__particleT ?? 0;
      const nextT = (prevT + speed) % 1;

      // Particle wrapped around → it arrived at the target node → trigger pulse
      if (nextT < prevT) {
        const target = link.target;
        target.__pulse = Math.min((target.__pulse ?? 0) + 0.25, 1.0);
      }

      link.__particleT = nextT;
      const t = nextT;

      _s.set(link.source.x, link.source.y, link.source.z);
      _e.set(link.target.x, link.target.y, link.target.z);
      _m.addVectors(_s, _e).multiplyScalar(0.5);
      _v.subVectors(_e, _s);
      const lineLen = _v.length();
      _p.crossVectors(_v, _up);
      if (_p.lengthSq() < 0.001) _p.crossVectors(_v, _FALLBACK_UP);
      _p.normalize();
      _c.copy(_m).addScaledVector(_p, link.curvature * lineLen);

      const t1 = 1 - t;
      _pt.set(
        t1 * t1 * _s.x + 2 * t1 * t * _c.x + t * t * _e.x,
        t1 * t1 * _s.y + 2 * t1 * t * _c.y + t * t * _e.y,
        t1 * t1 * _s.z + 2 * t1 * t * _c.z + t * t * _e.z,
      );
      link.__particle.position.copy(_pt);
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
    const dist = maxR * 3.0 + 100;
    const target = new Vector3(0, 0, 0);
    const camPos = new Vector3(dist * 0.5, dist * 0.35, dist * 0.7);
    this.startFlyTo(camPos, target);
  }

  private hubRadius(node: { val: number }): number {
    return 6 + node.val * 0.55;
  }

  // ── Update from graph data ─────────────────────────────────────────────

  updateData(graphData: GraphData): void {
    const { nodes, links } = graphData;
    if (nodes.length === 0) return;

    // Tear down previous
    this.simulation?.stop();
    this.clearGroup(this.nodeGroup);
    this.clearGroup(this.linkGroup);
    this.clearGroup(this.particleGroup);
    this.clearGroup(this.labelGroup);
    this.objToNode.clear();
    this.hoveredNode = null;
    this.simSettled = false;
    this.simTickCount = 0;

    // Build simulation nodes
    this.simNodes = nodes.map((n) => ({
      ...n,
      x: (Math.random() - 0.5) * 100,
      y: (Math.random() - 0.5) * 100,
      z: (Math.random() - 0.5) * 100,
      vx: 0, vy: 0, vz: 0,
    }));

    this.nodeById.clear();
    for (const sn of this.simNodes) this.nodeById.set(sn.id, sn);
    const nodeById = this.nodeById;

    // Build simulation links
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
        curvature: link.curvature ?? 0.1,
        graphLink: link,
      });
    }

    // Create Three.js objects for nodes
    for (const node of this.simNodes) {
      if (node.isWrapperContract) {
        this.createHubVisual(node);
      } else {
        this.createWalletVisual(node);
      }
      // Map the group to the node for raycasting
      if (node.__obj) this.objToNode.set(node.__obj, node);
    }

    // Create Three.js objects for links + particles
    for (const link of this.simLinks) {
      this.createLinkVisual(link);
      this.createParticleVisual(link);
    }

    // Start d3-force-3d simulation
    this.simulation = forceSimulation(this.simNodes, 3)
      .force('center', forceCenter(0, 0, 0).strength(0.3))
      .force('charge', forceManyBody()
        .strength((n: SimNode) => n.isWrapperContract ? -250 : -120))
      .force('link', forceLink(this.simLinks)
        .distance(35)
        .strength(0.6))
      .force('collision', forceCollide()
        .radius((n: SimNode) => n.isWrapperContract ? 30 + n.val * 1.5 : 6 + n.val)
        .strength(0.6))
      .alphaDecay(0.015)
      .velocityDecay(0.3)
      .stop();
  }

  // ── Visual builders ───────────────────────────────────────────────────

  private createHubVisual(node: SimNode): void {
    const group = new Group();
    const sym = node.tokenSymbol ?? '';
    const outerR = this.hubRadius(node);
    const depth = outerR * 0.1;

    // Extruded 3D token logo (same as homepage, scaled down)
    const logoScale = outerR / 100;
    const geom = getExtrudedLogoGeometry(sym, depth);
    const logoMesh = new Mesh(geom, getHubMat(sym));
    logoMesh.scale.set(logoScale, logoScale, 1);
    group.add(logoMesh);

    this.nodeGroup.add(group);
    node.__obj = group;

    // Label below
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

    const core = new Mesh(GEO_WALLET, MAT_WALLET);
    core.scale.setScalar(radius);
    group.add(core);

    this.nodeGroup.add(group);
    node.__obj = group;
  }

  private static CURVE_SEGMENTS = 30;

  private createLinkVisual(link: SimLink): void {
    const numPoints = HomeGPUScene.CURVE_SEGMENTS + 1;
    const positions = new Float32Array(numPoints * 3);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));

    const line = new Line(geo, getLinkMat(link.eventType));
    this.linkGroup.add(line);
    link.__line = line;
    link.__origColor = EDGE_COLORS[link.eventType] ?? 0xffd200;
  }

  private createParticleVisual(link: SimLink): void {
    const mesh = new Mesh(GEO_PARTICLE, getParticleMat(link.eventType));
    mesh.scale.setScalar(1.2);
    this.particleGroup.add(mesh);
    link.__particle = mesh;
    link.__particleT = Math.random();
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
      if (obj.geometry !== GEO_WALLET && obj.geometry !== GEO_PARTICLE && obj.geometry !== GEO_GLOW && obj.geometry !== GEO_HIGHLIGHT) {
        obj.geometry.dispose();
      }
      if (!Array.isArray(obj.material) && !_sharedMats.has(obj.material)) {
        obj.material.dispose();
      }
    }
    if (obj instanceof Line) {
      obj.geometry.dispose();
      // Link materials are shared per event type — don't dispose them
      if (!Array.isArray(obj.material) && !_sharedMats.has(obj.material)) {
        obj.material.dispose();
      }
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
    const dom = this.renderer?.domElement;
    if (dom) {
      dom.removeEventListener('mousemove', this.onMouseMove);
      dom.removeEventListener('click', this.onClick);
      dom.removeEventListener('mousedown', this.onMouseDown);
      dom.removeEventListener('mouseup', this.onMouseUp);
    }
    this.controls?.dispose();
    this.clearGroup(this.nodeGroup);
    this.clearGroup(this.linkGroup);
    this.clearGroup(this.particleGroup);
    this.clearGroup(this.labelGroup);
    if (this.tooltipEl?.parentNode) this.tooltipEl.parentNode.removeChild(this.tooltipEl);
    this.renderer?.dispose();
    if (this.container && this.renderer?.domElement) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
