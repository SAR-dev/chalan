"use client"

import { useState } from "react"
import { Markdown } from "@/components/markdown"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { type FaqRole, type FaqSection, sectionsForRole } from "./faq-sections"

type FaqTab = FaqRole | "all"

const TABS: { value: FaqTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "merchant", label: "Merchants" },
  { value: "rider", label: "Riders" },
  { value: "warehouse", label: "Warehouse admins" },
  { value: "super-admin", label: "Super admins" },
]

/** Role filter for the FAQ. "All" shows every section; a role tab shows that
 *  role's sections plus the shared ones. Signed-out visitors get "All". */
export function FaqTabs({ sections }: { sections: FaqSection[] }) {
  const [tab, setTab] = useState<FaqTab>("all")
  const visible = sectionsForRole(sections, tab)

  return (
    <div>
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as FaqTab)}
        data-testid="faq-tabs"
      >
        <TabsList>
          {TABS.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              data-testid={`faq-tab-${item.value}`}
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div data-testid={`faq-sections-${tab}`}>
        {visible.map((section) => (
          <section key={section.id} data-testid={`faq-section-${section.id}`}>
            <Markdown content={section.markdown} />
          </section>
        ))}
      </div>
    </div>
  )
}
