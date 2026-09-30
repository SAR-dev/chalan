import { db } from "@/lib/db"
import {
  merchantPackage,
  packagePurchaseRequest,
  pricingPackage,
  pricingPackageTier,
} from "@/lib/db/schema"
import { log } from "./helpers"
import { MERCHANT_IDS } from "./seed-content/merchants"

interface TierSeed {
  orderCount: number
  ruleType: "FLAT" | "PERCENT_OFF"
  ruleValue: number
}

interface PackageSeed {
  id: string
  name: string
  description: string
  price: number
  isActive: boolean
  tiers: TierSeed[]
}

export const PACKAGE_IDS = {
  starter: "PKG-100001E",
  growth: "PKG-100002E",
  enterprise: "PKG-100003E",
} as const

const PACKAGES: PackageSeed[] = [
  {
    id: PACKAGE_IDS.starter,
    name: "Starter 50",
    description:
      "For a young shop shipping a few parcels a day. Every delivery costs a flat 70 TK after 25 orders.",
    price: 1000,
    isActive: true,
    tiers: [
      { orderCount: 10, ruleType: "FLAT", ruleValue: 80 },
      { orderCount: 25, ruleType: "FLAT", ruleValue: 70 },
      { orderCount: 50, ruleType: "PERCENT_OFF", ruleValue: 20 },
    ],
  },
  {
    id: PACKAGE_IDS.growth,
    name: "Growth 200",
    description:
      "Percentage discounts that deepen as you ship. Best value once a shop is past 50 orders a month.",
    price: 3000,
    isActive: true,
    tiers: [
      { orderCount: 50, ruleType: "PERCENT_OFF", ruleValue: 30 },
      { orderCount: 100, ruleType: "PERCENT_OFF", ruleValue: 40 },
      { orderCount: 200, ruleType: "FLAT", ruleValue: 50 },
    ],
  },
  {
    id: PACKAGE_IDS.enterprise,
    name: "Enterprise 500",
    description:
      "Flat rates for high-volume shippers. Not yet on sale — visible to admins only.",
    price: 8000,
    isActive: false,
    tiers: [
      { orderCount: 200, ruleType: "FLAT", ruleValue: 60 },
      { orderCount: 500, ruleType: "FLAT", ruleValue: 45 },
    ],
  },
]

export async function seedPackages(): Promise<void> {
  log("Seeding packages…")

  const existing = await db.select().from(pricingPackage).limit(1)
  if (existing.length > 0) {
    log("  packages already exist, skipping")
    return
  }

  await db.insert(pricingPackage).values(
    PACKAGES.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      isActive: p.isActive,
      createdBy: "Seed",
    })),
  )

  await db.insert(pricingPackageTier).values(
    PACKAGES.flatMap((p) =>
      p.tiers.map((t, i) => ({
        packageId: p.id,
        orderCount: t.orderCount,
        sortOrder: i,
        ruleType: t.ruleType,
        ruleValue: t.ruleValue,
      })),
    ),
  )

  // merchant1 already owns an active bundle, mid-way through its second tier
  // (60 used: the 50-order tier is live, 40 more unlocks the next one) so the
  // dashboard, a real discount, and the progress bar are visible out of the box.
  await db.insert(merchantPackage).values({
    merchantId: MERCHANT_IDS.merchant1,
    packageId: PACKAGE_IDS.growth,
    ordersUsed: 60,
    isActive: true,
    assignedBy: "Seed",
  })

  // merchant2 has a request awaiting review so the admin queue is not empty.
  await db.insert(packagePurchaseRequest).values({
    merchantId: MERCHANT_IDS.merchant2,
    packageId: PACKAGE_IDS.starter,
    amount: 1000,
    status: "PENDING",
    note: "Sent 1000 TK via bKash, trxID SEEDPKG1",
  })

  const tierCount = PACKAGES.reduce((sum, p) => sum + p.tiers.length, 0)
  log(`  created ${PACKAGES.length} packages, ${tierCount} tiers`)
}
