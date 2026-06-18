import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Menu, X } from 'lucide-react'

const navLinks = [
  { label: 'Home', path: '/' },
  { label: 'Platform', path: '/platform' },
  { label: 'Impact', path: '/impact' },
  { label: 'Solutions', path: '/solutions' },
  { label: 'Stories', path: '/stories' },
  { label: 'About', path: '/about' },
]

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  return (
    <nav
      className="sticky top-0 z-50 h-[72px] flex items-center"
      style={{
        backgroundColor: 'rgba(246, 242, 236, 0.9)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div className="max-w-[1280px] mx-auto w-full px-6 flex items-center justify-between">
        {/* Logo */}
        <Link
          to="/"
          className="text-[22px] font-extrabold tracking-[-0.02em] text-text-primary"
        >
          Inyuku
        </Link>

        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path
            return (
              <Link
                key={link.path}
                to={link.path}
                className="relative px-4 py-2 text-[14px] font-medium transition-colors duration-200 rounded-md"
                style={{
                  color: isActive ? '#1A1A1A' : '#444444',
                  fontWeight: isActive ? 600 : 500,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = '#E86A34'
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = '#444444'
                }}
              >
                {link.label}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-6 rounded-full"
                    style={{ backgroundColor: '#E86A34' }}
                  />
                )}
              </Link>
            )
          })}
        </div>

        {/* Desktop CTA */}
        <Link
          to="/platform"
          className="hidden md:inline-flex items-center px-6 py-3 rounded-lg text-[14px] font-semibold text-white transition-all duration-250 hover:scale-[1.02] active:scale-[0.98]"
          style={{ backgroundColor: '#E86A34' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#D15A28'
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(232, 106, 52, 0.25)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#E86A34'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          Get Started
        </Link>

        {/* Mobile Hamburger */}
        <button
          className="md:hidden p-2 text-text-primary"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 top-[72px] z-40 md:hidden flex flex-col items-center pt-16 gap-8"
          style={{ backgroundColor: '#F6F2EC' }}
        >
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className="text-[28px] font-bold text-text-primary"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <Link
            to="/platform"
            className="mt-4 px-8 py-4 rounded-lg text-[16px] font-semibold text-white"
            style={{ backgroundColor: '#E86A34' }}
            onClick={() => setMobileOpen(false)}
          >
            Get Started
          </Link>
        </div>
      )}
    </nav>
  )
}
