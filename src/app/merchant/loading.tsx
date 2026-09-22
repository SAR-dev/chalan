export default function MerchantLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="bg-muted h-8 w-48 animate-pulse rounded-md" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-card border-border h-24 animate-pulse rounded-xl border"
          />
        ))}
      </div>
      <div className="bg-card border-border h-72 animate-pulse rounded-xl border" />
    </div>
  )
}
