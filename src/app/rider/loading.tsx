export default function RiderLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="bg-muted h-8 w-48 animate-pulse rounded-md" />
      <div className="bg-card border-border h-40 animate-pulse rounded-xl border" />
      <div className="bg-card border-border h-72 animate-pulse rounded-xl border" />
    </div>
  )
}
