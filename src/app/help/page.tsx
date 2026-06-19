import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Help Centre — Inyuku Digital',
  description: 'Answers to common questions about using Inyuku Digital.',
}

const faqs = [
  { q: 'What is Inyuku Digital?', a: 'A commerce and payments platform for South African small and informal businesses — sell over WhatsApp, manage inventory, and get paid securely.' },
  { q: 'How do payments work?', a: 'Payments are handled through a regulated escrow provider, so both buyers and sellers are protected. Funds are released to you once an order is fulfilled.' },
  { q: 'Which languages are supported?', a: 'We are building toward support for South Africa’s major languages, including isiZulu, isiXhosa, Afrikaans, Sesotho, and more.' },
  { q: 'How do I get started?', a: 'Sign-up opens with our platform launch. Use the Contact page to register your interest and we’ll let you know.' },
]

export default function HelpPage() {
  return (
    <main className="bg-[#F6F2EC] min-h-screen">
      <div className="max-w-[800px] mx-auto px-6 py-16 md:py-24">
        <h1 className="text-[32px] md:text-[48px] font-extrabold text-text-primary tracking-[-0.02em]">Help Centre</h1>
        <div className="mt-10 space-y-8">
          {faqs.map((f) => (
            <div key={f.q}>
              <h2 className="text-[20px] font-semibold text-text-primary">{f.q}</h2>
              <p className="mt-2 text-[16px] leading-relaxed text-text-secondary">{f.a}</p>
            </div>
          ))}
        </div>
        <p className="mt-12 text-[16px] text-text-secondary">
          Can’t find what you need? <a href="/contact" className="text-accent-orange font-medium">Contact us</a>.
        </p>
      </div>
    </main>
  )
}
