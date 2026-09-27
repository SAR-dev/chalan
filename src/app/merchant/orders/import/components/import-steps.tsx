"use client"

import { ArrowRight, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ImportPhase } from "../types"

const STEP_LABELS = ["Provide rows", "Review & fix", "Import"] as const

type StepState = "complete" | "active" | "upcoming"

interface ImportStepsProps {
  phase: ImportPhase
}

/** idle/parsing → step 1, preview/error → step 2, submitting/done → step 3. */
function activeIndex(phase: ImportPhase): number {
  switch (phase) {
    case "preview":
    case "error":
      return 1
    case "submitting":
    case "done":
      return 2
    default:
      return 0
  }
}

function stepState(index: number, active: number): StepState {
  if (index < active) return "complete"
  if (index === active) return "active"
  return "upcoming"
}

export function ImportSteps({ phase }: ImportStepsProps) {
  const active = activeIndex(phase)

  return (
    <ol className="flex flex-wrap items-center gap-2">
      {STEP_LABELS.map((label, index) => {
        const state = stepState(index, active)
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-current={state === "active" ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm",
                state === "active" && "border-primary font-medium",
                state === "upcoming" && "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                  state === "upcoming"
                    ? "text-muted-foreground border border-muted-foreground/50"
                    : "bg-primary text-primary-foreground",
                )}
              >
                {state === "complete" ? (
                  <Check className="size-3" aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              {label}
            </span>
            {index < STEP_LABELS.length - 1 ? (
              <ArrowRight
                className="text-muted-foreground size-4"
                aria-hidden="true"
              />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
