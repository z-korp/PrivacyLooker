import { GraphCanvas }          from '@/components/graph/GraphCanvas';
import { InfoPanel }             from '@/components/overlay/InfoPanel';
import { ErrorBanner }           from '@/components/overlay/ErrorBanner';
import { GifExporter }           from '@/components/overlay/GifExporter';
import { DataProvenanceBadge }   from '@/components/overlay/DataProvenanceBadge';
import { TimelineBar }           from '@/components/overlay/TimelineBar';
import { PrivacyToggle }         from '@/components/overlay/PrivacyToggle';
import { DataModeSwitch }        from '@/components/overlay/DataModeSwitch';
import { Legend }                from '@/components/overlay/Legend';
import { StatsPanel }            from '@/components/overlay/StatsPanel';

export default function Home() {
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black">
      {/* 3D Force Graph */}
      <GraphCanvas />

      {/* ── Top-left panel: logo + legend + stats ── */}
      <div
        className="fixed top-6 left-6 z-10 flex flex-col gap-4"
        style={{ maxWidth: '220px' }}
      >
        {/* Logo */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: '#FFD200', boxShadow: '0 0 10px 3px rgba(255,210,0,0.7)' }}
            />
            <span className="font-sans font-semibold text-white text-sm tracking-wide">
              zKorp
              <span className="text-white/30 mx-1.5">×</span>
              <span style={{ color: '#FFD200' }}>Zama</span>
            </span>
          </div>
          <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-white/30 pl-4">
            Privacy Transaction Visualizer
          </p>
          <div
            className="h-px ml-4 mt-1"
            style={{ backgroundColor: '#FFD200', width: 120, boxShadow: '0 0 6px 2px rgba(255,210,0,0.4)' }}
          />
        </div>

        {/* Separator */}
        <div className="h-px" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />

        {/* Legend */}
        <Legend />

        {/* Separator */}
        <div className="h-px" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />

        {/* Stats */}
        <StatsPanel />
      </div>

      {/* ── Top-right panel: FHE badge + mode indicator ── */}
      <div className="fixed top-6 right-6 z-10 flex flex-col items-end gap-4">
        <PrivacyToggle />
        <DataModeSwitch />
      </div>

      {/* ── Overlays ── */}
      <InfoPanel />
      <ErrorBanner />
      <GifExporter />

      {/* Data provenance — above timeline */}
      <div className="fixed bottom-36 left-6 z-20">
        <DataProvenanceBadge />
      </div>

      {/* Timeline bar — full width bottom */}
      <TimelineBar />
    </main>
  );
}
