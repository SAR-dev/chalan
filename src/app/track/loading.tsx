export default function TrackLoading() {
  return (
    <div className="bg-background relative min-h-screen overflow-hidden">
      <header className="border-border/60 bg-background/80 sticky top-0 z-20 border-b backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3.5">
          <div className="bg-muted h-7 w-28 animate-pulse rounded-md" />
          <div className="bg-muted h-7 w-7 animate-pulse rounded-md" />
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-5 pt-14 pb-20">
        <div className="flex flex-col items-center gap-4">
          <div className="bg-muted size-14 animate-pulse rounded-2xl" />
          <div className="bg-muted h-8 w-56 animate-pulse rounded-md" />
          <div className="bg-muted h-5 w-72 animate-pulse rounded-md" />
        </div>
        <div className="bg-card ring-border/70 mx-auto mt-8 h-15 max-w-lg animate-pulse rounded-2xl ring-1" />
        <div className="mt-16 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card/60 rounded-xl border p-4">
              <div className="bg-muted size-9 animate-pulse rounded-lg" />
              <div className="bg-muted mt-3 h-4 w-24 animate-pulse rounded" />
              <div className="bg-muted mt-2 h-3 w-full animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
