import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Partners — Inyuku Digital',
  description: 'Partner with Inyuku Digital to grow South Africa’s informal economy.',
}

export default function PartnersPage() {
  return (
    <main className="bg-[#F6F2EC] min-h-screen">
      <div className="max-w-[800px] mx-auto px-6 py-16 md:py-24">
        <h1 className="text-[32px] md:text-[48px] font-extrabold text-text-primary tracking-[-0.02em]">Partner with us</h1>
        <p className="mt-4 text-[18px] leading-relaxed text-text-secondary">
          We work with financial institutions, government programmes, NGOs, and technology providers to bring digital
          commerce to South Africa’s small and informal businesses. If your organisation shares that mission, we’d love
          to talk.
        </p>
        <a href="/contact" className="inline-flex mt-8 px-8 py-4 rounded-lg text-[15px] font-semibold text-white" style={{ backgroundColor: '#E86A34' }}>
          Get in touch
        </a>
      </div>
    </main>
  )
}
