"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { pageContent } from "@/config/content"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import {
  InactiveAccountCard,
  VerificationCard,
} from "../new/components/account-alerts"
import { ImportClient } from "./import-client"

export default function ImportOrdersPage() {
  const { currentMerchant } = useMerchants()

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
        <ImportClient />
      )}
    </div>
  )
}
