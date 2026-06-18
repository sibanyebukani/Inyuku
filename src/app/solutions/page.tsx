import type { Metadata } from 'next'
import SolutionsClient from './SolutionsClient'

export const metadata: Metadata = {
  title: 'Solutions — Inyuku Digital',
  description: 'Purpose-built solutions for spaza shops, traders, artisans, and caterers.',
}

export default function Page() { return <SolutionsClient /> }
