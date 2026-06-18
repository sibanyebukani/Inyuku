import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: '2rem', textAlign: 'center' }}>
      <div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>404 — Page not found</h1>
        <p style={{ marginBottom: '1rem', color: '#666' }}>The page you’re looking for doesn’t exist.</p>
        <Link href="/" style={{ color: '#E86A34', fontWeight: 600 }}>Back to home</Link>
      </div>
    </div>
  )
}
