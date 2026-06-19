import type { Metadata } from 'next'
import HomeClient from './HomeClient'

export const metadata: Metadata = {
  title: 'Inyuku Digital — Commerce for South Africa’s small businesses',
  description: 'Sell over WhatsApp, manage inventory, and get paid securely. Inyuku Digital brings digital commerce to South Africa’s small and informal businesses.',
}

export default function Page() { return <HomeClient /> }
