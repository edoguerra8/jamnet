import { Suspense } from 'react'
import FlowContent from './FlowContent'
import CompassIcon from '@/components/CompassIcon'

export default function FlowPage() {
  return (
    <Suspense
      fallback={
        <div className="h-dvh flex flex-col items-center justify-center bg-ivory dark:bg-dark-bg gap-4">
          <CompassIcon spinning size={48} className="text-ink dark:text-ivory" />
          <p className="text-sm font-sans text-muted">Finding music…</p>
        </div>
      }
    >
      <FlowContent />
    </Suspense>
  )
}
