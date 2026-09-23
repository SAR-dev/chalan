import { db } from "@/lib/db"
import { deliveryCity } from "@/lib/db/schema"
import { log } from "./helpers"
import { WAREHOUSE_IDS } from "./seed-content"

const CITIES = [
  {
    id: "DC-100001E",
    name: "Dhaka",
    zoneId: "DZ-100001E",
    warehouseId: WAREHOUSE_IDS.dhakaCentralHub,
  },
  {
    id: "DC-100002E",
    name: "Chittagong",
    zoneId: "DZ-100002E",
    warehouseId: WAREHOUSE_IDS.chattogramPortHub,
  },
  {
    id: "DC-100003E",
    name: "Sylhet",
    zoneId: "DZ-100002E",
    warehouseId: WAREHOUSE_IDS.chattogramPortHub,
  },
  {
    id: "DC-100004E",
    name: "Rajshahi",
    zoneId: "DZ-100002E",
    warehouseId: WAREHOUSE_IDS.chattogramPortHub,
  },
  {
    id: "DC-100005E",
    name: "Khulna",
    zoneId: "DZ-100002E",
    warehouseId: WAREHOUSE_IDS.chattogramPortHub,
  },
  {
    id: "DC-100006E",
    name: "Barisal",
    zoneId: "DZ-100003E",
    warehouseId: WAREHOUSE_IDS.sylhetRegionalDepot,
  },
  {
    id: "DC-100007E",
    name: "Rangpur",
    zoneId: "DZ-100003E",
    warehouseId: WAREHOUSE_IDS.sylhetRegionalDepot,
  },
  {
    id: "DC-100008E",
    name: "Mymensingh",
    zoneId: "DZ-100002E",
    warehouseId: WAREHOUSE_IDS.chattogramPortHub,
  },
]

export async function seedDeliveryCities() {
  log("Seeding delivery cities…")

  const existing = await db.select().from(deliveryCity).limit(1)
  if (existing.length > 0) {
    log("  delivery cities already exist, skipping")
    return
  }

  await db.insert(deliveryCity).values(CITIES)
  log(`  created ${CITIES.length} delivery cities`)
}
