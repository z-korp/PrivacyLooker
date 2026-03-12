import { GraphCanvas } from '@/components/graph/GraphCanvas';
import { Logo } from '@/components/overlay/Logo';
import { PrivacyToggle } from '@/components/overlay/PrivacyToggle';
import { DataModeSwitch } from '@/components/overlay/DataModeSwitch';
import { Legend } from '@/components/overlay/Legend';
import { InfoPanel } from '@/components/overlay/InfoPanel';
import { ErrorBanner } from '@/components/overlay/ErrorBanner';

export default function Home() {
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-noir">
      {/* 3D Force Graph — SSR-safe dynamic import */}
      <GraphCanvas />

      {/* UI Overlays */}
      <Logo />
      <PrivacyToggle />
      <Legend />
      <DataModeSwitch />
      <InfoPanel />
      <ErrorBanner />
    </main>
  );
}
