import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { cookies } from 'next/headers'
import IntlProvider from '@/components/IntlProvider'
import './globals.css'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

const SUPPORTED_LOCALES = ['en', 'zu', 'xh', 'af', 'st', 'tn', 'nso', 'ts']

export const metadata: Metadata = {
  title: 'Inyuku Digital',
  description:
    'Digital commerce platform for South African informal and small businesses — WhatsApp commerce, digital payments, inventory, and an AI business assistant.',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const raw = cookieStore.get('inyuku_locale')?.value ?? 'en'
  const locale = SUPPORTED_LOCALES.includes(raw) ? raw : 'en'
  const messages = (await import(`../messages/${locale}.json`)).default

  return (
    <html lang={locale} className={inter.variable}>
      <body>
        <IntlProvider locale={locale} messages={messages}>
          <Navbar />
          <main>{children}</main>
          <Footer />
        </IntlProvider>
      </body>
    </html>
  )
}
