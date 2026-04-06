import Link from 'next/link'

const surfaces = [
  {
    href: '/evaluate',
    label: 'Evaluate Portfolio',
    description: 'Drag and drop a CSV or JSON file to run it against all active rules.',
  },
  {
    href: '/admin/rules',
    label: 'Rules Admin',
    description: 'Create, edit, and manage hard stop and warning rules.',
  },
  {
    href: '/api-docs',
    label: 'API Docs',
    description: 'Explore the REST API and run live requests.',
  },
]

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="max-w-xl w-full">
        <h1 className="text-3xl font-semibold tracking-tight mb-2">
          Model Portfolio Evaluator
        </h1>
        <p className="text-muted-foreground mb-10">
          Evaluate investment portfolios against configurable hard stop and warning rules.
        </p>
        <nav className="flex flex-col gap-3">
          {surfaces.map(({ href, label, description }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-lg border border-border bg-card px-5 py-4 hover:border-foreground/30 hover:bg-accent transition-colors"
            >
              <div className="font-medium mb-0.5 group-hover:underline underline-offset-2">
                {label}
              </div>
              <div className="text-sm text-muted-foreground">{description}</div>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
