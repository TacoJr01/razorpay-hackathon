import type { Metadata } from 'next';
import { Playfair_Display, Inter } from 'next/font/google';
import './globals.css';

const fraunces = Playfair_Display({
  subsets: ['latin'],
  weight: ['600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['800', '900'],
  variable: '--font-bold',
});

export const metadata: Metadata = {
  title: 'Hisaab',
  description: 'Conversational B2B bulk-trade agent demo',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`} suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t!=='light')document.documentElement.dataset.theme='dark';}catch(e){document.documentElement.dataset.theme='dark';}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
