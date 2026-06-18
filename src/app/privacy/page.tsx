import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Inyuku Digital',
  description: 'How Inyuku Digital collects, uses, and protects personal information under POPIA.',
}

export default function PrivacyPage() {
  return (
    <main className="bg-[#F6F2EC] min-h-screen">
      <div className="max-w-[800px] mx-auto px-6 py-16 md:py-24">
        <div className="mb-8 rounded-lg border border-[#E86A34]/40 bg-[#E86A34]/10 px-4 py-3 text-[14px] text-text-primary">
          <strong>DRAFT — pending legal review.</strong> This policy is a working draft and is not yet legally binding.
        </div>
        <h1 className="text-[32px] md:text-[48px] font-extrabold text-text-primary tracking-[-0.02em]">Privacy Policy</h1>
        <p className="mt-2 text-[14px] text-text-secondary">Last updated: 2026-06-19 (DRAFT)</p>

        <div className="mt-10 space-y-8 text-[16px] leading-relaxed text-text-primary">
          <section>
            <h2 className="text-[22px] font-semibold mb-2">1. Who we are</h2>
            <p>Inyuku Digital (“we”, “us”) is the responsible party for personal information processed through our
            platform, as defined by the Protection of Personal Information Act, 2013 (POPIA). Our Information Officer
            can be reached via the details on our <a href="/contact" className="text-accent-orange font-medium">Contact</a> page.</p>
          </section>
          <section>
            <h2 className="text-[22px] font-semibold mb-2">2. Information we collect</h2>
            <p>We collect information you provide directly — such as your name, business name, email address, and
            phone number — and information generated as you use the platform, including transaction and inventory
            records you create as a merchant.</p>
          </section>
          <section>
            <h2 className="text-[22px] font-semibold mb-2">3. Why we process it</h2>
            <p>We process personal information to provide and improve the service, communicate with you, process
            payments through our escrow partner, comply with legal obligations, and (with your consent) send you
            marketing communications.</p>
          </section>
          <section>
            <h2 className="text-[22px] font-semibold mb-2">4. Lawful basis &amp; consent</h2>
            <p>We process information where it is necessary to perform our contract with you, to comply with the law,
            for our legitimate interests, or where you have given consent. You may withdraw consent at any time.</p>
          </section>
          <section>
            <h2 className="text-[22px] font-semibold mb-2">5. Sharing &amp; operators</h2>
            <p>We share information with operators who process it on our behalf under written agreements, including our
            hosting, database, payment (escrow), messaging, and email providers. They may process data outside South
            Africa; see “Cross-border transfers” below.</p>
          </section>
          <section>
            <h2 className="text-[22px] font-semibold mb-2">6. Cross-border transfers</h2>
            <p>Some operators store data in the European Union. We transfer personal information across borders only
            where the recipient is bound by adequate data-protection safeguards, consistent with section 72 of POPIA.</p>
          </section>
          <section>
            <h2 className="text-[22px] font-semibold mb-2">7. Retention</h2>
            <p>We keep personal information only as long as necessary for the purposes described or as required by law,
            after which it is securely deleted or de-identified.</p>
          </section>
          <section>
            <h2 className="text-[22px] font-semibold mb-2">8. Your rights</h2>
            <p>You have the right to access, correct, or delete your personal information, to object to processing, and
            to lodge a complaint with the Information Regulator of South Africa. Contact us to exercise these rights.</p>
          </section>
          <section>
            <h2 className="text-[22px] font-semibold mb-2">9. Security</h2>
            <p>We apply appropriate technical and organisational measures to protect personal information, including
            encryption of sensitive data and access controls.</p>
          </section>
        </div>
      </div>
    </main>
  )
}
