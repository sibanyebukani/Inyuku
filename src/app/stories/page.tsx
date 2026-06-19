import type { Metadata } from 'next'
import StoriesClient from './StoriesClient'

export const metadata: Metadata = {
  title: 'Stories — Inyuku Digital',
  description: 'Real merchant success stories from South Africa’s informal economy.',
}

export default function Page() { return <StoriesClient /> }
