import type { Metadata } from 'next'
import AboutClient from './AboutClient'

export const metadata: Metadata = {
  title: 'About — Inyuku Digital',
  description: 'Our mission to bring digital commerce and financial inclusion to South African small businesses.',
}

export default function Page() { return <AboutClient /> }
