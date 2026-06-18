'use client'

import Link from 'next/link'

const platformLinks = [
  { label: 'WhatsApp Commerce', path: '/platform' },
  { label: 'AI Business Agent', path: '/platform' },
  { label: 'Digital Payments', path: '/platform' },
  { label: 'Inventory Management', path: '/platform' },
]

const companyLinks = [
  { label: 'About Us', path: '/about' },
  { label: 'Our Impact', path: '/impact' },
  { label: 'Success Stories', path: '/stories' },
  { label: 'Partners', path: '/partners' },
]

const resourceLinks = [
  { label: 'Help Center', path: '/help' },
  { label: 'Partner Program', path: '/partners' },
  { label: 'Contact', path: '/contact' },
]

export default function Footer() {
  return (
    <footer style={{ backgroundColor: '#1A1A1A' }}>
      {/* CTA Strip */}
      <div
        className="w-full"
        style={{
          background: 'linear-gradient(135deg, #E86A34 0%, #D15A28 100%)',
          padding: '80px 24px',
        }}
      >
        <div className="max-w-[800px] mx-auto text-center">
          <h2
            className="text-[36px] md:text-[48px] font-extrabold text-white leading-tight tracking-[-0.03em]"
          >
            Ready to Digitize Your Business?
          </h2>
          <p className="mt-4 text-[18px] md:text-[20px] text-white/80 leading-relaxed max-w-[600px] mx-auto">
            Join thousands of South African SMEs already growing with Inyuku Digital.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/platform"
              className="px-8 py-4 rounded-lg text-[15px] font-bold transition-all duration-250 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                backgroundColor: '#FFFFFF',
                color: '#E86A34',
              }}
            >
              Get Started Free
            </Link>
            <Link
              href="/about"
              className="px-8 py-4 rounded-lg text-[15px] font-semibold text-white transition-all duration-250 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                border: '1.5px solid rgba(255,255,255,0.4)',
                backgroundColor: 'transparent',
              }}
            >
              Talk to Our Team
            </Link>
          </div>
        </div>
      </div>

      {/* Footer Content */}
      <div className="max-w-[1280px] mx-auto px-6 pt-20 pb-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Col 1: Logo + Mission */}
          <div>
            <Link href="/" className="text-[22px] font-extrabold text-[#F6F2EC] tracking-[-0.02em]">
              Inyuku
            </Link>
            <p className="mt-4 text-[14px] leading-relaxed" style={{ color: '#78716C' }}>
              Transforming South Africa's informal economy through accessible digital tools and financial inclusion.
            </p>
          </div>

          {/* Col 2: Platform */}
          <div>
            <h4 className="text-[16px] font-semibold text-[#F6F2EC] mb-4">Platform</h4>
            <ul className="space-y-3">
              {platformLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.path}
                    className="text-[14px] transition-colors duration-200 hover:text-[#F6F2EC]"
                    style={{ color: '#78716C' }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Company */}
          <div>
            <h4 className="text-[16px] font-semibold text-[#F6F2EC] mb-4">Company</h4>
            <ul className="space-y-3">
              {companyLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.path}
                    className="text-[14px] transition-colors duration-200 hover:text-[#F6F2EC]"
                    style={{ color: '#78716C' }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 4: Resources */}
          <div>
            <h4 className="text-[16px] font-semibold text-[#F6F2EC] mb-4">Resources</h4>
            <ul className="space-y-3">
              {resourceLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.path}
                    className="text-[14px] transition-colors duration-200 hover:text-[#F6F2EC]"
                    style={{ color: '#78716C' }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div
          className="mt-16 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}
        >
          <p className="text-[13px]" style={{ color: '#78716C' }}>
            &copy; {new Date().getFullYear()} Inyuku Digital. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="text-[13px] transition-colors duration-200 hover:text-[#F6F2EC]" style={{ color: '#78716C' }}>
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-[13px] transition-colors duration-200 hover:text-[#F6F2EC]" style={{ color: '#78716C' }}>
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
