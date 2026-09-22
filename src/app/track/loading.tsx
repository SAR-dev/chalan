export default function TrackLoading() {
  return (
    <div className="bg-background min-h-screen">
      {/* Header skeleton */}
      <header className="border-border/60 bg-background/80 sticky top-0 z-10 border-b backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3.5">
          <div className="bg-muted h-7 w-28 animate-pulse rounded-md" />
          <div className="bg-muted h-7 w-7 animate-pulse rounded-md" />
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-5 py-12">
        <div className="flex flex-col gap-4">
          <div className="bg-muted h-8 w-48 animate-pulse rounded-md" />
          <div className="bg-muted h-5 w-72 animate-pulse rounded-md" />
          <div className="bg-muted mt-4 h-12 w-full animate-pulse rounded-lg" />
        </div>
      </div>
    </div>
  )
}
