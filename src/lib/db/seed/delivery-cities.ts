import { db } from "@/lib/db"
import { deliveryCity } from "@/lib/db/schema"
import { log } from "./helpers"
import { WAREHOUSE_IDS } from "./seed-content"

const CITIES = [
  {
    id: "seed_city_dhaka",
    name: "Dhaka",
    zoneId: "seed_zone_dhaka",
    warehouseId: WAREHOUSE_IDS.dhakaCentralHub,
  },
  {
    id: "seed_city_chittagong",
    name: "Chittagong",
    zoneId: "seed_zone_divisional",
    warehouseId: WAREHOUSE_IDS.chattogramPortHub,
  },
  {
    id: "seed_city_sylhet",
    name: "Sylhet",
    zoneId: "seed_zone_divisional",
    warehouseId: WAREHOUSE_IDS.chattogramPortHub,
  },
  {
    id: "seed_city_rajshahi",
    name: "Rajshahi",
    zoneId: "seed_zone_divisional",
    warehouseId: WAREHOUSE_IDS.chattogramPortHub,
  },
  {
    id: "seed_city_khulna",
    name: "Khulna",
    zoneId: "seed_zone_divisional",
    warehouseId: WAREHOUSE_IDS.chattogramPortHub,
  },
  {
    id: "seed_city_barisal",
    name: "Barisal",
    zoneId: "seed_zone_remote",
    warehouseId: WAREHOUSE_IDS.sylhetRegionalDepot,
  },
  {
    id: "seed_city_rangpur",
    name: "Rangpur",
    zoneId: "seed_zone_remote",
    warehouseId: WAREHOUSE_IDS.sylhetRegionalDepot,
  },
  {
    id: "seed_city_mymensingh",
    name: "Mymensingh",
    zoneId: "seed_zone_divisional",
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
