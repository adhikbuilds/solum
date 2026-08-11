import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Solum — land feasibility',
  description: 'Development appraisal for Dubai residential land, with every figure derivable.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
