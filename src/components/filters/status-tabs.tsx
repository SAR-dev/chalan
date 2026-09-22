"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export interface StatusTab {
  label: string
  value: string | undefined
}

interface StatusTabsProps {
  tabs: StatusTab[]
  value: string | undefined
  onChange: (value: string | undefined) => void
  className?: string
}

export function StatusTabs({
  tabs,
  value,
  onChange,
  className,
}: StatusTabsProps) {
  return (
    <Tabs
      value={value ?? "__ALL__"}
      onValueChange={(v) => onChange(v === "__ALL__" ? undefined : v)}
      className={className}
    >
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.label} value={tab.value ?? "__ALL__"}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
