import { GoogleTagManager, GoogleAnalytics } from '@next/third-parties/google';
import type { Metadata } from 'next';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import './globals.css';
import ServiceWorkerRegistrar from './components/ServiceWorkerRegistrar';
import { Geist_Mono, Inter } from 'next/font/google';

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '#bargah.com.br',
  description:
    'Ao invés de ficar de olho em várias redes sociais, veja as principais promoções em tempo real!',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Bargah',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <head>
        <link rel="icon" href="/icons/favicon-96x96.png" sizes="96x96" type="image/png" />
        <link rel="icon" href="/icons/favicon.ico" sizes="32x32 16x16" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#2d3561" />
      </head>
      <GoogleTagManager gtmId="GTM-KWSXXTV4" />
      <GoogleAnalytics gaId="G-5CE7FZ2TYX" />
      <body
        className={`${geistMono.variable} ${inter.variable}`}
      >
        <ServiceWorkerRegistrar />
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
