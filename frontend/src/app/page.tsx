export default function Home() {
  return (
    <div className="flex-center" style={{ minHeight: '100vh', padding: '2rem' }}>
      <main className="text-center glass-panel" style={{ maxWidth: '800px', padding: '3rem 2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '1rem', color: 'var(--accent-primary)' }}>
          Automated Reporting App for SPED
        </h1>
        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', marginBottom: '2.5rem' }}>
          Streamlining IEP, Assessment, and Monthly Progress reporting for Special Needs Education through unified inputs and AI-driven goals.
        </p>
        <div className="flex-center" style={{ gap: '1rem' }}>
          <a href="/login" className="btn-primary" style={{ textDecoration: 'none', fontSize: '1.1rem' }}>
            Login to Portal
          </a>
        </div>
      </main>
    </div>
  );
}
