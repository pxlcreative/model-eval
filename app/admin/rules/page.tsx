import type { Metadata } from 'next'
import RulesPage from './RulesPage'

export const metadata: Metadata = {
  title: 'Rules — Model Portfolio Evaluator',
}

export default function Page() {
  return <RulesPage />
}
