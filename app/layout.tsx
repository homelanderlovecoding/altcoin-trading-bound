import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Bound — Cross-chain Altcoin Trading',
  description: 'BTC → any token, two-leg execution via SODAX + LiFi',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${geist.className} bg-zinc-950 text-white antialiased`}>
        {children}
      </body>
    </html>
  );
}
