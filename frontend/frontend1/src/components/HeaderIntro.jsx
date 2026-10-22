export default function HeaderIntro({ groupId, results, onLogout, children }) {
  return (
    <>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="settle home"><span className="brand-mark">S</span><span>settle<span className="brand-dot">.</span></span></a>
        <span className="topbar-label">EXPENSE SHARING ENGINE</span>
        {onLogout && <button className="button button-outline sign-out" onClick={onLogout}>Sign out</button>}
      </header>
      <main id="top" className="page-wrap">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><span className="status-dot" /> LESS MATH. MORE CLARITY.</span>
          <h1>Shared expenses,<br /><em>settled simply.</em></h1>
          <p>Create a group, record who paid, and see who owes whom. No awkward calculations required.</p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="coin coin-main">₦</div><div className="coin coin-small coin-a">↗</div><div className="coin coin-small coin-b">✓</div>
          <div className="art-caption">EVERY NAIRA<br />ACCOUNTED FOR</div>
        </div>
      </section>
      <div className="steps" aria-label="Workflow"><div className="step active"><span>01</span><div><b>Build your group</b><small>Add the people</small></div></div><div className="step-line" /><div className={`step ${groupId ? 'active' : ''}`}><span>02</span><div><b>Add contributions</b><small>Check the total</small></div></div><div className="step-line" /><div className={`step ${results ? 'active' : ''}`}><span>03</span><div><b>Settle up</b><small>View the breakdown</small></div></div></div>
      {children}
      </main>
    </>
  );
}
