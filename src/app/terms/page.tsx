import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — Inyuku Digital',
  description: 'The terms governing use of the Inyuku Digital platform.',
}

export default function TermsPage() {
  return (
    <main className="bg-[#F6F2EC] min-h-screen">
      <div className="max-w-[800px] mx-auto px-6 py-16 md:py-24">
        <div className="mb-8 rounded-lg border border-[#E86A34]/40 bg-[#E86A34]/10 px-4 py-3 text-[14px] text-text-primary">
          <strong>DRAFT — pending legal review.</strong> These terms are a working draft and are not yet legally binding.
        </div>
        <h1 className="text-[32px] md:text-[48px] font-extrabold text-text-primary tracking-[-0.02em]">Terms of Service</h1>
        <p className="mt-2 text-[14px] text-text-secondary">Last updated: 2026-06-19 (DRAFT)</p>
        <div className="mt-10 space-y-8 text-[16px] leading-relaxed text-text-primary">
          <section><h2 className="text-[22px] font-semibold mb-2">1. Acceptance</h2><p>By using Inyuku Digital you agree to these terms. If you do not agree, do not use the service.</p></section>
          <section><h2 className="text-[22px] font-semibold mb-2">2. The service</h2><p>Inyuku Digital provides commerce, payments, and business-management tools for small and informal businesses in South Africa. Features may change as the platform evolves.</p></section>
          <section><h2 className="text-[22px] font-semibold mb-2">3. Accounts</h2><p>You are responsible for the accuracy of your account information and for keeping your credentials secure. You must be authorised to act for any business you register.</p></section>
          <section><h2 className="text-[22px] font-semibold mb-2">4. Payments &amp; escrow</h2><p>Payments are processed through a regulated third-party escrow provider. Funds are held and released by that provider according to its terms; Inyuku does not hold your funds.</p></section>
          <section><h2 className="text-[22px] font-semibold mb-2">5. Acceptable use</h2><p>You may not use the service for unlawful activity, to infringe others’ rights, or to disrupt the platform.</p></section>
          <section><h2 className="text-[22px] font-semibold mb-2">6. Content</h2><p>You retain ownership of content you submit and grant us a licence to use it to operate and promote the service, subject to our Privacy Policy.</p></section>
          <section><h2 className="text-[22px] font-semibold mb-2">7. Liability</h2><p>The service is provided “as is”. To the extent permitted by law, we limit our liability for indirect or consequential loss.</p></section>
          <section><h2 className="text-[22px] font-semibold mb-2">8. Governing law</h2><p>These terms are governed by the laws of the Republic of South Africa.</p></section>
        </div>
      </div>
    </main>
  )
}
