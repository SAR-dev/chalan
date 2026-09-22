export default function TrackDetailLoading() {
  return (
    <div className="bg-background min-h-screen">
      <header className="border-border/60 bg-background/80 sticky top-0 z-10 border-b backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3.5">
          <div className="bg-muted h-7 w-28 animate-pulse rounded-md" />
          <div className="bg-muted h-7 w-7 animate-pulse rounded-md" />
        </div>
      </header>
      <div className="mx-auto max-w-2xl space-y-4 px-5 py-8">
        <div className="bg-muted h-6 w-40 animate-pulse rounded-md" />
        <div className="bg-card border-border rounded-xl border p-6">
          <div className="flex flex-col gap-3">
            <div className="bg-muted h-5 w-32 animate-pulse rounded" />
            <div className="bg-muted h-4 w-56 animate-pulse rounded" />
            <div className="bg-muted h-4 w-44 animate-pulse rounded" />
          </div>
        </div>
        <div className="bg-card border-border rounded-xl border p-6">
          <div className="flex flex-col gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="bg-muted size-8 animate-pulse rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="bg-muted h-4 w-32 animate-pulse rounded" />
                  <div className="bg-muted h-3 w-24 animate-pulse rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
