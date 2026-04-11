import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ForgeMsg',
  description: 'Unified omnichannel messaging platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
