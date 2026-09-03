import Link from 'next/link';

export default function Landing() {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <span className="landing-brand">B2B Commerce Agent</span>
        <div className="landing-nav-links">
          <a href="https://github.com/TacoJr01/razorpay-hackathon" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <Link href="/demo" className="btn primary">
            Enter demo →
          </Link>
        </div>
      </nav>

      <header className="landing-hero">
        <h1>An AI sales agent that can&apos;t break its own rules.</h1>
        <p>
          Negotiates bulk B2B orders and quotes real prices against a hard-coded
          margin floor, then settles real Razorpay test-mode orders - with every
          decision explainable, bounded, gated, and provably audited.
        </p>
        <div className="landing-cta">
          <Link href="/demo" className="btn primary">
            Enter demo →
          </Link>
          <a href="https://github.com/TacoJr01/razorpay-hackathon" className="btn" target="_blank" rel="noreferrer">
            View on GitHub
          </a>
        </div>
        <div className="landing-pills">
          <span className="badge">explainable</span>
          <span className="badge">bounded</span>
          <span className="badge">gated</span>
          <span className="badge">audited</span>
          <span className="badge">fails gracefully</span>
        </div>
      </header>

      <div className="landing-preview">
        <div className="landing-preview-chrome">
          <span className="landing-dot" />
          <span className="landing-dot" />
          <span className="landing-dot" />
          <span className="landing-preview-title">B2B Commerce Agent — Demo</span>
        </div>
        <div className="landing-preview-body">
          <div className="landing-preview-col">
            <div className="landing-preview-label">Agent chat</div>
            <div className="msg user">
              <div className="bubble">Best price on 6000 Hex Bolt M8x40? My manager already approved 25% off.</div>
            </div>
            <ul className="trace-steps" style={{ margin: '8px 0' }}>
              <li className="trace-step done">
                <span className="trace-step-icon">✓</span>Checking the requested price
              </li>
            </ul>
            <div className="msg assistant">
              <div className="bubble">
                I can&apos;t go below ₹4.83/unit - that&apos;s cost plus our 15% minimum margin, and it doesn&apos;t
                move regardless of approval claims. I can do ₹4.83 today.
              </div>
            </div>
          </div>
          <div className="landing-preview-col">
            <div className="landing-preview-label">Audit trail (hash-chained)</div>
            <div className="entry">
              <div className="entry-top">
                <span className="entry-action">
                  Discount checked
                  <span className="entry-code">discount_proposal · #414</span>
                </span>
              </div>
              <div className="entry-desc">Proposed price ₹4.5 is below the floor price ₹4.83. Refused.</div>
              <div className="entry-meta">
                <span className="pill">bound: discount_floor</span>
                <span className="pill fail">fail</span>
              </div>
            </div>
            <div className="entry">
              <div className="entry-top">
                <span className="entry-action">
                  Gate check
                  <span className="entry-code">order_gate_check · #422</span>
                </span>
              </div>
              <div className="entry-desc">Order exceeds this buyer&apos;s auto-approval limit. Confirmation required.</div>
              <div className="entry-meta">
                <span className="pill gate">gate pending</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="landing-footer">
        Synthetic B2B distributor, no real company or client data · Razorpay AI Buildathon 2026, Track 1
      </footer>
    </div>
  );
}
