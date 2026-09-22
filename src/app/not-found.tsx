import { Package } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center px-5">
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <span className="bg-muted flex size-14 items-center justify-center rounded-full">
          <Package className="text-muted-foreground size-7" />
        </span>
        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground font-mono text-sm font-medium">
            404
          </p>
          <h1 className="text-xl font-semibold">Page not found</h1>
          <p className="text-muted-foreground text-sm">
            The page you&apos;re looking for doesn&apos;t exist or has been
            moved.
          </p>
        </div>
        <Button
          render={<Link href="/">Go home</Link>}
          nativeButton={false}
          size="sm"
        />
      </div>
    </div>
  )
}
