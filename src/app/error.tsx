'use client'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: '2rem', textAlign: 'center' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Something went wrong</h1>
        <p style={{ marginBottom: '1rem', color: '#666' }}>Please try again.</p>
        <button onClick={() => reset()} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: '#E86A34', color: 'white' }}>
          Try again
        </button>
      </div>
    </div>
  )
}
