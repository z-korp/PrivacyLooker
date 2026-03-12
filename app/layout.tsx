import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PrivacyLooker — zKorp × Zama',
  description:
    'Real-time 3D visualization of Ethereum transactions. Toggle Zama FHE encryption to see the power of privacy.',
  keywords: ['FHE', 'Zama', 'zKorp', 'Ethereum', 'blockchain', 'privacy', 'encryption'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans bg-noir overflow-hidden">{children}</body>
    </html>
  );
}
