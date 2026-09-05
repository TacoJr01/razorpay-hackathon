'use client';

import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import { HAND_CARD_ASCII, HAND_CARD_MASK } from './hand-card-ascii';
import { DotBackground } from './dot-background';

export default function HeroCreditCard() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black">
      {/* Dotted background: even grid, rotated, each dot flickering independently */}
      <DotBackground />

      {/* Background art: static ASCII render of a hand holding a card */}
      <div className="absolute inset-0 w-full h-full hidden lg:flex items-center overflow-hidden pl-64 pt-24">
        <div className="relative">
          <pre
            aria-hidden
            className="absolute inset-0 text-black select-none"
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '9.5px',
              lineHeight: '9.5px',
              whiteSpace: 'pre',
            }}
          >
            {HAND_CARD_MASK}
          </pre>
          <pre
            className="relative text-white/80 select-none"
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '9.5px',
              lineHeight: '9.5px',
              whiteSpace: 'pre',
            }}
          >
            {HAND_CARD_ASCII}
          </pre>
        </div>
      </div>

      {/* Top Header */}
      <div className="absolute top-0 left-0 right-0 z-20 border-b border-white/20">
        <div className="container mx-auto px-4 lg:px-8 py-3 lg:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 lg:gap-4">
            <div className="font-mono text-white text-3xl lg:text-4xl font-bold tracking-widest italic transform -skew-x-12">
              HISAAB
            </div>
            <div className="h-3 lg:h-4 w-px bg-white/40"></div>
            <span className="text-white/60 text-[8px] lg:text-[10px] font-mono">EST. 2026</span>
          </div>
        </div>
      </div>

      {/* Corner Frame Accents */}
      <div className="absolute top-0 left-0 w-8 h-8 lg:w-12 lg:h-12 border-t-2 border-l-2 border-white/30 z-20"></div>
      <div className="absolute top-0 right-0 w-8 h-8 lg:w-12 lg:h-12 border-t-2 border-r-2 border-white/30 z-20"></div>
      <div className="absolute left-0 w-8 h-8 lg:w-12 lg:h-12 border-b-2 border-l-2 border-white/30 z-20" style={{ bottom: '5vh' }}></div>
      <div className="absolute right-0 w-8 h-8 lg:w-12 lg:h-12 border-b-2 border-r-2 border-white/30 z-20" style={{ bottom: '5vh' }}></div>

      {/* CTA Content */}
      <div className="relative z-10 flex min-h-screen items-center justify-end pt-16 lg:pt-0" style={{ marginTop: '5vh' }}>
        <div className="w-full lg:w-1/2 px-6 lg:px-16 lg:pr-[10%]">
          <div className="max-w-lg relative lg:ml-auto">
            {/* Top decorative line */}
            <div className="flex items-center gap-2 mb-3 opacity-60">
              <div className="w-8 h-px bg-white"></div>
              <CreditCard className="w-3 h-3 text-white" strokeWidth={1.5} />
              <div className="flex-1 h-px bg-white"></div>
            </div>

            {/* Title with dithered accent */}
            <div className="relative">
              <div className="hidden lg:block absolute -right-3 top-0 bottom-0 w-1 dither-pattern opacity-40"></div>
              <h1
                className="text-2xl lg:text-5xl font-bold text-white mb-3 lg:mb-4 leading-tight font-mono tracking-wider whitespace-nowrap lg:-ml-[5%]"
                style={{ letterSpacing: '0.1em' }}
              >
                CREDIT, EARNED
              </h1>
            </div>

            {/* Decorative dots pattern - desktop only */}
            <div className="hidden lg:flex gap-1 mb-3 opacity-40">
              {Array.from({ length: 40 }).map((_, i) => (
                <div key={i} className="w-0.5 h-0.5 bg-white rounded-full"></div>
              ))}
            </div>

            {/* Description with subtle grid pattern */}
            <div className="relative">
              <p className="text-xs lg:text-base text-gray-300 mb-5 lg:mb-6 leading-relaxed font-mono opacity-80">
                Like a credit line, trust isn&apos;t given — it&apos;s built one verified order at
                a time. Every clean transaction raises the ceiling; the margin floor never moves.
              </p>

              {/* Technical corner accent - desktop only */}
              <div
                className="hidden lg:block absolute -left-4 top-1/2 w-3 h-3 border border-white opacity-30"
                style={{ transform: 'translateY(-50%)' }}
              >
                <div
                  className="absolute top-1/2 left-1/2 w-1 h-1 bg-white"
                  style={{ transform: 'translate(-50%, -50%)' }}
                ></div>
              </div>
            </div>

            {/* Buttons with technical accents */}
            <div className="flex flex-col lg:flex-row gap-3 lg:gap-4">
              <Link
                href="/demo"
                className="relative px-5 lg:px-6 py-2 lg:py-2.5 bg-transparent text-white font-mono text-xs lg:text-sm border border-white hover:bg-white hover:text-black transition-all duration-200 group text-center no-underline"
              >
                <span className="hidden lg:block absolute -top-1 -left-1 w-2 h-2 border-t border-l border-white opacity-0 group-hover:opacity-100 transition-opacity"></span>
                <span className="hidden lg:block absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-white opacity-0 group-hover:opacity-100 transition-opacity"></span>
                ENTER DEMO
              </Link>

              <Link
                href="/merchant"
                className="relative px-5 lg:px-6 py-2 lg:py-2.5 bg-transparent border border-white text-white font-mono text-xs lg:text-sm hover:bg-white hover:text-black transition-all duration-200 text-center no-underline"
                style={{ borderWidth: '1px' }}
              >
                MERCHANT
              </Link>

              <a
                href="https://github.com/TacoJr01/razorpay-hackathon"
                target="_blank"
                rel="noreferrer"
                className="relative px-5 lg:px-6 py-2 lg:py-2.5 bg-transparent border border-white text-white font-mono text-xs lg:text-sm hover:bg-white hover:text-black transition-all duration-200 text-center no-underline"
                style={{ borderWidth: '1px' }}
              >
                VIEW ON GITHUB
              </a>
            </div>

            {/* Bottom technical notation - desktop only */}
            <div className="hidden lg:flex items-center gap-2 mt-6 opacity-40">
              <CreditCard className="w-2.5 h-2.5 text-white" strokeWidth={1.5} />
              <div className="flex-1 h-px bg-white"></div>
              <span className="text-white text-[9px] font-mono">HISAAB.PROTOCOL</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Footer */}
      <div
        className="absolute left-0 right-0 z-20 border-t border-white/20 bg-black/40 backdrop-blur-sm"
        style={{ bottom: '5vh' }}
      >
        <div className="container mx-auto px-4 lg:px-8 py-2 lg:py-3 flex items-center justify-end">
          <div className="flex items-center gap-2 lg:gap-4 text-[8px] lg:text-[9px] font-mono text-white/50">
            <div className="flex gap-1">
              <div className="w-1 h-1 bg-white/60 rounded-full animate-pulse"></div>
              <div className="w-1 h-1 bg-white/40 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-1 h-1 bg-white/20 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
            </div>
            <div className="hidden lg:flex flex-col items-end">
              <span className="text-xs lg:text-sm text-white/80">Made By: Aditya Sunil Thattamparambil</span>
              <a
                href="https://github.com/TacoJr01"
                target="_blank"
                rel="noreferrer"
                className="text-white/50 hover:text-white/80 no-underline"
              >
                github.com/TacoJr01
              </a>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .dither-pattern {
          background-image:
            repeating-linear-gradient(0deg, transparent 0px, transparent 1px, white 1px, white 2px),
            repeating-linear-gradient(90deg, transparent 0px, transparent 1px, white 1px, white 2px);
          background-size: 3px 3px;
        }
      `}</style>
    </main>
  );
}
