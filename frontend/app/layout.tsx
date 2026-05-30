import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Voice Outreach — Multi-Agent Platform',
  description: 'AI-powered voice outreach with configurable agents, personas, and A/B testing',
};

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/agents', label: 'Agents', icon: '🤖' },
  { href: '/personas', label: 'Personas', icon: '👤' },
  { href: '/campaigns', label: 'Campaigns', icon: '📣' },
  { href: '/conversations', label: 'Conversations', icon: '💬' },
  { href: '/analytics', label: 'Analytics', icon: '📈' },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-dark-900 text-gray-100 antialiased flex flex-col">
        <header className="border-b border-dark-600 bg-dark-800/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <h1 className="text-lg font-semibold tracking-tight">Voice Outreach</h1>
              <span className="px-2 py-0.5 text-xs font-mono bg-accent/20 text-accent-light rounded">MULTI-AGENT</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 live-pulse"></span>
              <span className="text-xs text-gray-400 font-mono">LIVE</span>
            </div>
          </div>
          {/* Navigation tabs */}
          <nav className="max-w-[1400px] mx-auto px-4 sm:px-6">
            <div className="flex gap-1 overflow-x-auto">
              {NAV_ITEMS.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-accent/50 transition-colors whitespace-nowrap"
                >
                  <span className="mr-1.5">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </header>
        <main className="max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-6 flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}
