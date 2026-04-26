import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Parametric Model Projects',
  description: 'Upload parametric models, generate project links, and let end users preview and export printable files.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
