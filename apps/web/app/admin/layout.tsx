import type { Metadata } from 'next';
import AdminNav from './_components/admin-nav';
import { requireAdminPage } from './_lib/auth';
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
}

/** Every admin page requires a logged-in session (see _lib/auth.ts). */
export default async function IntelligenceLayout({ children }: LayoutProps) {
  await requireAdminPage();

  return (
    <div data-intelligence>
      <div className="mx-auto max-w-7xl px-6 pt-6">
        <AdminNav />
      </div>
      {children}
    </div>
  );
}
