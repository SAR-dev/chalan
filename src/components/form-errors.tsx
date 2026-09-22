"use client"

import { AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface FormErrorsProps {
  errors: Record<string, string> | null
  className?: string
}

/**
 * Form-level error banner that displays all validation error messages.
 * Pass the output of `validateFormData()` from `@/lib/validation`.
 */
export function FormErrors({ errors, className }: FormErrorsProps) {
  if (!errors || Object.keys(errors).length === 0) return null

  const messages = Object.values(errors)

  return (
    <div
      role="alert"
      className={cn(
        "bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <div className="flex flex-col gap-0.5">
          {messages.map((msg) => (
            <span key={msg}>{msg}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
