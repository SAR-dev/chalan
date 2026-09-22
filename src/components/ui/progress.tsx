"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface ProgressProps extends React.ComponentPropsWithoutRef<"div"> {
  value?: number
}

function Progress({ className, value = 0, ...props }: ProgressProps) {
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      data-slot="progress"
      className={cn(
        "bg-primary/10 relative h-2 w-full overflow-hidden rounded-full",
        className,
      )}
      {...props}
    >
      <div
        className="bg-primary h-full w-full flex-1 transition-all duration-300 ease-in-out"
        style={{
          transform: `translateX(-${100 - Math.min(Math.max(value, 0), 100)}%)`,
        }}
      />
    </div>
  )
}

export { Progress }
