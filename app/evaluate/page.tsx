import type { Metadata } from 'next'
import EvaluatePage from './EvaluatePage'

export const metadata: Metadata = {
  title: 'Evaluate — Model Portfolio Evaluator',
}

export default function Page() {
  return <EvaluatePage />
}
