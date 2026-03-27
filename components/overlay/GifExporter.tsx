'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/appStore';

type ExportState = 'idle' | 'recording' | 'encoding' | 'done';

// GIF output dimensions (square, good for social)
const GIF_SIZE    = 480;
// 4-second loop at 12fps
const TOTAL_FRAMES = 48;
const FRAME_DELAY  = 83; // ms (~12fps)
// Camera sweeps 300° during the loop
const SWEEP_RADIANS = (5 / 6) * Math.PI * 2;

export function GifExporter() {
  const fgInstance  = useAppStore((s) => s.fgInstance);
  const dataMode    = useAppStore((s) => s.dataMode);

  const [exportState, setExportState] = useState<ExportState>('idle');
  const [progress, setProgress]       = useState(0);
  const [showPanel, setShowPanel]     = useState(false);
  const cancelRef = useRef(false);

  // Restore camera to position before capture
  const savedCam = useRef<{ x: number; y: number; z: number } | null>(null);

  const handleExport = useCallback(async () => {
    if (!fgInstance) return;
    setExportState('recording');
    setProgress(0);
    cancelRef.current = false;

    // Lazy-load gifenc — only pulled when user clicks export
    const { GIFEncoder, quantize, applyPalette } = await import('gifenc');

    const canvas = fgInstance.renderer()?.domElement as HTMLCanvasElement | null;
    if (!canvas) { setExportState('idle'); return; }

    // Offscreen canvas for downsampled GIF frames
    const offscreen = document.createElement('canvas');
    offscreen.width  = GIF_SIZE;
    offscreen.height = GIF_SIZE;
    const ctx = offscreen.getContext('2d', { willReadFrequently: true })!;

    // Snapshot current camera to restore after capture
    const cam = fgInstance.camera();
    const { x: cx, y: cy, z: cz } = cam.position;
    savedCam.current = { x: cx, y: cy, z: cz };

    const dist      = Math.sqrt(cx * cx + cy * cy + cz * cz);
    const elevation = Math.atan2(cy, Math.sqrt(cx * cx + cz * cz));
    const startAz   = Math.atan2(cz, cx);

    const gif = GIFEncoder();

    for (let i = 0; i < TOTAL_FRAMES; i++) {
      if (cancelRef.current) break;

      // Fly camera around the scene
      const az = startAz + (i / TOTAL_FRAMES) * SWEEP_RADIANS;
      const nx  = dist * Math.cos(elevation) * Math.cos(az);
      const ny  = dist * Math.sin(elevation);
      const nz  = dist * Math.cos(elevation) * Math.sin(az);
      fgInstance.cameraPosition({ x: nx, y: ny, z: nz }, { x: 0, y: 0, z: 0 }, 0);

      // Two rAF ticks: one for camera update, one for render commit
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

      if (cancelRef.current) break;

      // Centre-crop canvas to a square, then scale to GIF_SIZE
      const srcW = canvas.width;
      const srcH = canvas.height;
      const side = Math.min(srcW, srcH);
      const sx   = (srcW - side) / 2;
      const sy   = (srcH - side) / 2;
      ctx.clearRect(0, 0, GIF_SIZE, GIF_SIZE);
      ctx.drawImage(canvas, sx, sy, side, side, 0, 0, GIF_SIZE, GIF_SIZE);

      const imageData = ctx.getImageData(0, 0, GIF_SIZE, GIF_SIZE);
      const palette   = quantize(imageData.data, 256);
      const index     = applyPalette(imageData.data, palette);

      gif.writeFrame(index, GIF_SIZE, GIF_SIZE, {
        palette,
        delay: FRAME_DELAY,
        ...(i === 0 ? { repeat: 0 } : {}), // repeat: 0 = loop forever
      });

      setProgress(Math.round(((i + 1) / TOTAL_FRAMES) * 100));
    }

    // Restore camera
    if (savedCam.current) {
      const { x, y, z } = savedCam.current;
      fgInstance.cameraPosition({ x, y, z }, { x: 0, y: 0, z: 0 }, 600);
    }

    if (cancelRef.current) {
      setExportState('idle');
      setProgress(0);
      return;
    }

    setExportState('encoding');
    // Short yield so the UI renders "Encoding…"
    await new Promise<void>((r) => setTimeout(r, 20));

    gif.finish();
    const bytes = gif.bytes();
    // Cast needed: gifenc returns Uint8Array<ArrayBufferLike> but Blob expects ArrayBuffer
    const blob  = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/gif' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href      = url;
    const label = `zkorp-zama-${dataMode}-fhe`;
    a.download  = `${label}-${Date.now()}.gif`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 15_000);

    setExportState('done');
    setTimeout(() => {
      setExportState('idle');
      setProgress(0);
      setShowPanel(false);
    }, 2500);
  }, [fgInstance, dataMode]);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const isActive = exportState !== 'idle';

  return (
    <div className="fixed bottom-24 right-5 z-20 flex flex-col items-end gap-2">
      {/* Info panel */}
      <AnimatePresence>
        {showPanel && !isActive && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            className="rounded-xl border p-4 w-64 flex flex-col gap-3 noise-texture"
            style={{
              background: 'rgba(10,10,10,0.6)',
              borderColor: true ? 'rgba(255,210,0,0.15)' : 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
          >
            <p className="font-mono text-[10px] text-white/60 leading-relaxed">
              Exports a <span className="text-white">480 × 480 GIF</span> (4 sec, 12 fps) with a 300° camera fly-around.
              Ideal for Twitter/X, LinkedIn, or embedding on a website.
            </p>
            <div className="flex flex-col gap-1 text-[9px] font-mono text-white/30">
              <div>Mode: <span className="text-white/60">{dataMode === 'live' ? 'Live Network' : 'Simulation'}</span></div>
              <div>Theme: <span style={{ color: true ? '#FFD200' : '#ffffff' }}>
                {true ? 'Avec Zama (FHE)' : 'Sans Zama'}
              </span></div>
            </div>
            <button
              onClick={handleExport}
              disabled={!fgInstance}
              className="w-full py-2 rounded-lg font-mono text-[10px] font-semibold tracking-wider uppercase transition-all disabled:opacity-30"
              style={{
                background: true ? '#FFD200' : '#ffffff',
                color: '#000000',
              }}
            >
              Start Export
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recording progress panel */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="rounded-xl border p-4 w-64 flex flex-col gap-3 noise-texture"
            style={{
              background: 'rgba(10,10,10,0.6)',
              borderColor: true ? 'rgba(255,210,0,0.2)' : 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {exportState === 'recording' && (
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                )}
                {exportState === 'encoding' && (
                  <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin"
                    style={{ borderColor: true ? '#FFD200' : '#ffffff' }}
                  />
                )}
                {exportState === 'done' && (
                  <span className="text-green-400 text-sm">✓</span>
                )}
                <span className="font-mono text-[10px] text-white/70">
                  {exportState === 'recording' && 'Recording frames…'}
                  {exportState === 'encoding'  && 'Encoding GIF…'}
                  {exportState === 'done'      && 'Downloaded!'}
                </span>
              </div>
              {exportState === 'recording' && (
                <span className="font-mono text-[9px]" style={{ color: true ? '#FFD200' : '#aaa' }}>
                  {progress}%
                </span>
              )}
            </div>

            {exportState === 'recording' && (
              <>
                {/* Progress bar */}
                <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: true ? '#FFD200' : '#ffffff' }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.1 }}
                  />
                </div>
                <p className="font-mono text-[9px] text-white/25">
                  Camera rotating around the scene…
                </p>
                <button
                  onClick={handleCancel}
                  className="w-full py-1.5 rounded-lg font-mono text-[9px] tracking-wider uppercase border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-colors"
                >
                  Cancel
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trigger button */}
      <motion.button
        onClick={() => !isActive && setShowPanel((v) => !v)}
        disabled={isActive}
        className="w-10 h-10 rounded-full flex items-center justify-center border transition-all"
        animate={{
          borderColor: true ? 'rgba(255,210,0,0.2)' : 'rgba(255,255,255,0.1)',
          backgroundColor: showPanel && !isActive
            ? true ? 'rgba(255,210,0,0.08)' : 'rgba(255,255,255,0.06)'
            : 'rgba(10,10,10,0.55)',
          boxShadow: showPanel ? '0 0 10px 2px rgba(255,210,0,0.1)' : 'none',
        }}
        title="Export animated GIF"
        whileTap={{ scale: 0.92 }}
      >
        {/* Camera icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M6 2H10L11.5 4H14C14.55 4 15 4.45 15 5V12C15 12.55 14.55 13 14 13H2C1.45 13 1 12.55 1 12V5C1 4.45 1.45 4 2 4H4.5L6 2Z"
            stroke={true ? '#FFD200' : 'rgba(255,255,255,0.5)'}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <circle
            cx="8" cy="8.5" r="2.2"
            stroke={true ? '#FFD200' : 'rgba(255,255,255,0.5)'}
            strokeWidth="1.2"
          />
        </svg>
      </motion.button>
    </div>
  );
}
