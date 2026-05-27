import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import './intelligence.css';

export const metadata: Metadata = {
  title: 'intelligence',
  description: '',
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ secret: string }>;
}

/**
 * Gate: validates the URL slug against DASHBOARD_SECRET. Mismatches return a
 * plain 404 — no signal that an admin route even exists at this URL pattern.
 *
 * The check runs on the server, so the env-var secret never travels to the
 * browser. The slug itself appears in the URL bar of authorized visitors,
 * which is acceptable for this stage (single operator).
 */
export default async function IntelligenceLayout({
  children,
  params,
}: LayoutProps) {
  const { secret } = await params;
  const expected = process.env.DASHBOARD_SECRET;

  if (!expected || !secureCompare(secret, expected)) {
    notFound();
  }

  return <div data-intelligence>{children}</div>;
}

function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
