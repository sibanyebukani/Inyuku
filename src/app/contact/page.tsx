import type { Metadata } from 'next'
import ContactForm from './ContactForm'

export const metadata: Metadata = {
  title: 'Contact — Inyuku Digital',
  description: 'Get in touch with the Inyuku Digital team.',
}

export default function ContactPage() {
  return (
    <main className="bg-[#F6F2EC] min-h-screen">
      <div className="max-w-[800px] mx-auto px-6 py-16 md:py-24">
        <h1 className="text-[32px] md:text-[48px] font-extrabold text-text-primary tracking-[-0.02em]">Contact us</h1>
        <p className="mt-3 text-[18px] text-text-secondary">
          Questions, partnerships, or support — send us a message and we’ll get back to you.
        </p>
        <div className="mt-10"><ContactForm /></div>
      </div>
    </main>
  )
}
