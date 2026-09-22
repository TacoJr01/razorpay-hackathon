'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';

const NAV_LINKS = [
  { href: '/demo', label: 'Chat' },
  { href: '/demo/orders', label: 'Orders' },
  { href: '/demo/catalog', label: 'Catalog' },
  { href: '/demo/account', label: 'Account' },
];

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    const resolved: Theme = stored === 'light' ? 'light' : 'dark';
    setTheme(resolved);
    document.documentElement.dataset.theme = resolved;
  }, []);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <Link href="/" className="topbar-brand">
          <h1>Hisaab — Demo</h1>
        </Link>
        <nav className="merchant-nav">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`merchant-nav-link${pathname === link.href ? ' active' : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          aria-label="Toggle theme"
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </div>
      {children}
    </div>
  );
}
