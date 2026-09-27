"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { pageContent } from "@/config/content"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import {
  InactiveAccountCard,
  VerificationCard,
} from "../new/components/account-alerts"
import { ImportSteps } from "./components/import-steps"
import { ImportClient } from "./import-client"
import type { ImportPhase } from "./types"

export default function ImportOrdersPage() {
  const { currentMerchant } = useMerchants()
  const [phase, setPhase] = useState<ImportPhase>("idle")

  if (!currentMerchant) return null

  const notActive = currentMerchant.status !== "ACTIVE"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.merchant.importOrders.title}
        description={pageContent.merchant.importOrders.description}
      >
        <Button
          variant="outline"
          render={<Link href="/merchant/orders" />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </PageHeader>

      {notActive ? (
        <InactiveAccountCard merchant={currentMerchant} />
      ) : !currentMerchant.emailVerifiedAt || !currentMerchant.nidVerifiedAt ? (
        <VerificationCard merchant={currentMerchant} />
      ) : (
        <>
          <ImportSteps phase={phase} />
          <ImportClient phase={phase} setPhase={setPhase} />
        </>
      )}
    </div>
  )
}
