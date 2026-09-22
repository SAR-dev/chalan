export default function LandingLoading() {
  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-5 py-16">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="bg-muted h-10 w-64 animate-pulse rounded-lg" />
          <div className="bg-muted h-5 w-96 animate-pulse rounded" />
          <div className="bg-muted h-10 w-36 animate-pulse rounded-lg" />
        </div>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-card border-border h-40 animate-pulse rounded-xl border"
            />
          ))}
        </div>
      </div>
    </div>
  )
}
