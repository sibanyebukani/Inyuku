import type { Metadata } from 'next'
import PlatformClient from './PlatformClient'

export const metadata: Metadata = {
  title: 'Platform — Inyuku Digital',
  description: 'WhatsApp commerce, AI business agent, digital payments, and inventory management for South African small businesses.',
}

export default function Page() { return <PlatformClient /> }
