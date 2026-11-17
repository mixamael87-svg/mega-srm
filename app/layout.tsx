import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'MEGA SRM' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
