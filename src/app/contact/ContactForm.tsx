'use client'
import { useState } from 'react'

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return setError('Please enter your name.')
    if (!emailRe.test(form.email)) return setError('Please enter a valid email address.')
    if (!form.message.trim()) return setError('Please enter a message.')
    setError(null)
    // TODO(M1): POST { ...form, source: 'contact' } to /api/leads once the backend is live.
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center border border-[#E7E5E4]">
        <h3 className="text-[22px] font-bold text-text-primary">Thanks for reaching out!</h3>
        <p className="mt-2 text-text-secondary">We’ll be in touch soon.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && <p role="alert" className="text-[14px] text-red-600">{error}</p>}
      <div>
        <label htmlFor="contact-name" className="block text-[14px] font-medium text-text-primary mb-1.5">Your name</label>
        <input id="contact-name" type="text" value={form.name}
          onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
          className="w-full px-4 py-3.5 rounded-lg text-[15px] bg-[#F6F2EC] border border-[#E7E5E4] outline-none focus:ring-2 focus:ring-[#E86A34]" />
      </div>
      <div>
        <label htmlFor="contact-email" className="block text-[14px] font-medium text-text-primary mb-1.5">Email</label>
        <input id="contact-email" type="email" value={form.email}
          onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
          className="w-full px-4 py-3.5 rounded-lg text-[15px] bg-[#F6F2EC] border border-[#E7E5E4] outline-none focus:ring-2 focus:ring-[#E86A34]" />
      </div>
      <div>
        <label htmlFor="contact-message" className="block text-[14px] font-medium text-text-primary mb-1.5">Message</label>
        <textarea id="contact-message" rows={4} value={form.message}
          onChange={(e) => setForm((s) => ({ ...s, message: e.target.value }))}
          className="w-full px-4 py-3.5 rounded-lg text-[15px] bg-[#F6F2EC] border border-[#E7E5E4] outline-none focus:ring-2 focus:ring-[#E86A34] resize-none" />
      </div>
      <button type="submit" className="w-full py-4 rounded-lg text-[15px] font-semibold text-white" style={{ backgroundColor: '#E86A34' }}>
        Send message
      </button>
    </form>
  )
}
