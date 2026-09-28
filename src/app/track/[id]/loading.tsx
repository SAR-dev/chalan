export default function TrackDetailLoading() {
  return (
    <div className="bg-background min-h-screen">
      <header className="border-border/60 bg-background/80 sticky top-0 z-20 border-b backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3.5">
          <div className="bg-muted h-7 w-28 animate-pulse rounded-md" />
          <div className="bg-muted h-7 w-7 animate-pulse rounded-md" />
        </div>
      </header>
      <div className="mx-auto max-w-4xl space-y-4 px-5 py-8">
        <div className="bg-muted h-5 w-40 animate-pulse rounded-md" />

        {/* Status hero */}
        <div className="bg-card border-border rounded-2xl border p-6">
          <div className="flex items-start gap-4">
            <div className="bg-muted size-12 animate-pulse rounded-2xl" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="bg-muted h-5 w-40 animate-pulse rounded" />
              <div className="bg-muted h-4 w-64 animate-pulse rounded" />
            </div>
          </div>
          <div className="bg-muted mt-5 h-2 w-full animate-pulse rounded-full" />
        </div>

        {/* Timeline + sidebar */}
        <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
          <div className="bg-card border-border rounded-2xl border p-5">
            <div className="flex flex-col gap-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3.5">
                  <div className="bg-muted size-9 shrink-0 animate-pulse rounded-full" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <div className="bg-muted h-4 w-32 animate-pulse rounded" />
                    <div className="bg-muted h-3 w-24 animate-pulse rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className="bg-card border-border rounded-2xl border p-5">
              <div className="bg-muted h-4 w-32 animate-pulse rounded" />
              <div className="mt-4 flex flex-col gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-4"
                  >
                    <div className="bg-muted h-3 w-24 animate-pulse rounded" />
                    <div className="bg-muted h-3 w-16 animate-pulse rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
