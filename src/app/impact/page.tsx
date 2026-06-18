import type { Metadata } from 'next'
import ImpactClient from './ImpactClient'

export const metadata: Metadata = {
  title: 'Impact — Inyuku Digital',
  description: 'The economic and social impact of digitising South Africa’s informal economy.',
}

export default function Page() { return <ImpactClient /> }
