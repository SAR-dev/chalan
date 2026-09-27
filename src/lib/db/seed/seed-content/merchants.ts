import {
  SEED_IMAGE_PLACEHOLDER,
  SEED_PASSWORD,
  SEED_USER_CREDENTIALS,
} from "./credentials"
import { ADMIN_USER_NAMES } from "./users"

// ---------------------------------------------------------------------------
// Deterministic: Merchants (6 — including demo)
// Each entry carries the user password so the seed module can create accounts.
// ---------------------------------------------------------------------------
export interface MerchantSeedEntry {
  id: string
  businessName: string
  ownerName: string
  email: string
  password: string
  phone: string
  address: string
  status: "PENDING" | "ACTIVE" | "SUSPENDED"
  businessType?:
    | "E-commerce"
    | "Restaurant"
    | "Grocery"
    | "Pharmacy"
    | "Fashion"
    | "Electronics"
    | "Other"
  onboardingCompletedAt?: string | null
  emailVerifiedAt: string | null
  phoneVerifiedAt: string | null
  baseRate: number
  extraRatePerKg: number
  maxWeightKg: number
  freeWeightKg: number
  logoUrl?: string | null
  brandColor?: string | null
  hidePlatformBranding?: boolean
  approvedBy: string | null
  approvedAt: string | null
  nidFrontImage: string | null
  nidBackImage: string | null
  nidSelfieImage: string | null
  nidSubmittedAt: string | null
  nidVerifiedAt: string | null
  nidVerifiedBy: string | null
}

export const MERCHANT_IDS = {
  merchant1: "MER-100001E",
  merchant2: "MER-100002E",
  merchant3: "MER-100003E",
  merchant4: "MER-100004E",
  merchant5: "MER-100005E",
  demo: "MER-100006E",
} as const

export const SEED_DEMO_CREDENTIALS = {
  email: "demo@kikuya.com",
  password: SEED_PASSWORD,
}

export const SEED_MERCHANTS: MerchantSeedEntry[] = [
  {
    id: MERCHANT_IDS.merchant1,
    businessName: "Merchant 1 Business",
    ownerName: "Owner 1",
    email: SEED_USER_CREDENTIALS.merchant1.email,
    password: SEED_USER_CREDENTIALS.merchant1.password,
    phone: "+8801711000101",
    address: "100 Business Street, Dhaka",
    status: "ACTIVE",
    emailVerifiedAt: "2026-07-01T00:00:00.000Z",
    phoneVerifiedAt: "2026-07-01T00:00:00.000Z",
    // merchant1 is the primary e2e account — onboarded so merchant flows land
    // on the dashboard instead of racing the /welcome guard.
    onboardingCompletedAt: "2026-07-01T00:00:00.000Z",
    baseRate: 50,
    extraRatePerKg: 10,
    maxWeightKg: 10,
    freeWeightKg: 1,
    logoUrl: "/placeholder.svg",
    brandColor: "#2563eb",
    hidePlatformBranding: false,
    approvedBy: ADMIN_USER_NAMES.tanvir,
    approvedAt: "2026-07-02T00:00:00.000Z",
    nidFrontImage: SEED_IMAGE_PLACEHOLDER,
    nidBackImage: SEED_IMAGE_PLACEHOLDER,
    nidSelfieImage: SEED_IMAGE_PLACEHOLDER,
    nidSubmittedAt: "2026-07-01T00:00:00.000Z",
    nidVerifiedAt: "2026-07-01T00:00:00.000Z",
    nidVerifiedBy: "System",
  },
  {
    id: MERCHANT_IDS.merchant2,
    businessName: "Merchant 2 Business",
    ownerName: "Owner 2",
    email: SEED_USER_CREDENTIALS.merchant2.email,
    password: SEED_USER_CREDENTIALS.merchant2.password,
    phone: "+8801711000102",
    address: "200 Business Street, Dhaka",
    status: "ACTIVE",
    emailVerifiedAt: "2026-07-02T00:00:00.000Z",
    phoneVerifiedAt: "2026-07-02T00:00:00.000Z",
    baseRate: 60,
    extraRatePerKg: 15,
    maxWeightKg: 10,
    freeWeightKg: 1,
    approvedBy: ADMIN_USER_NAMES.tanvir,
    approvedAt: "2026-07-03T00:00:00.000Z",
    nidFrontImage: SEED_IMAGE_PLACEHOLDER,
    nidBackImage: SEED_IMAGE_PLACEHOLDER,
    nidSelfieImage: SEED_IMAGE_PLACEHOLDER,
    nidSubmittedAt: "2026-07-01T00:00:00.000Z",
    nidVerifiedAt: "2026-07-01T00:00:00.000Z",
    nidVerifiedBy: "System",
  },
  {
    id: MERCHANT_IDS.merchant3,
    businessName: "Merchant 3 Business",
    ownerName: "Owner 3",
    email: SEED_USER_CREDENTIALS.merchant3.email,
    password: SEED_USER_CREDENTIALS.merchant3.password,
    phone: "+8801711000103",
    address: "300 Business Street, Dhaka",
    status: "ACTIVE",
    emailVerifiedAt: "2026-07-03T00:00:00.000Z",
    phoneVerifiedAt: "2026-07-03T00:00:00.000Z",
    baseRate: 70,
    extraRatePerKg: 20,
    maxWeightKg: 10,
    freeWeightKg: 1,
    approvedBy: ADMIN_USER_NAMES.tanvir,
    approvedAt: "2026-07-04T00:00:00.000Z",
    nidFrontImage: SEED_IMAGE_PLACEHOLDER,
    nidBackImage: SEED_IMAGE_PLACEHOLDER,
    nidSelfieImage: SEED_IMAGE_PLACEHOLDER,
    nidSubmittedAt: "2026-07-01T00:00:00.000Z",
    nidVerifiedAt: "2026-07-01T00:00:00.000Z",
    nidVerifiedBy: "System",
  },
  {
    id: MERCHANT_IDS.merchant4,
    businessName: "Merchant 4 Business",
    ownerName: "Owner 4",
    email: SEED_USER_CREDENTIALS.merchant4.email,
    password: SEED_USER_CREDENTIALS.merchant4.password,
    phone: "+8801711000104",
    address: "400 Business Street, Dhaka",
    status: "ACTIVE",
    emailVerifiedAt: "2026-07-04T00:00:00.000Z",
    phoneVerifiedAt: null,
    baseRate: 80,
    extraRatePerKg: 25,
    maxWeightKg: 10,
    freeWeightKg: 1,
    approvedBy: "System",
    approvedAt: "2026-07-04T00:00:00.000Z",
    nidFrontImage: SEED_IMAGE_PLACEHOLDER,
    nidBackImage: SEED_IMAGE_PLACEHOLDER,
    nidSelfieImage: SEED_IMAGE_PLACEHOLDER,
    nidSubmittedAt: "2026-07-01T00:00:00.000Z",
    nidVerifiedAt: "2026-07-01T00:00:00.000Z",
    nidVerifiedBy: "System",
  },
  {
    id: MERCHANT_IDS.merchant5,
    businessName: "Merchant 5 Business",
    ownerName: "Owner 5",
    email: SEED_USER_CREDENTIALS.merchant5.email,
    password: SEED_USER_CREDENTIALS.merchant5.password,
    phone: "+8801711000105",
    address: "500 Business Street, Dhaka",
    status: "SUSPENDED",
    emailVerifiedAt: "2026-07-04T00:00:00.000Z",
    phoneVerifiedAt: null,
    baseRate: 50,
    extraRatePerKg: 10,
    maxWeightKg: 10,
    freeWeightKg: 1,
    approvedBy: ADMIN_USER_NAMES.tanvir,
    approvedAt: "2026-07-05T00:00:00.000Z",
    nidFrontImage: SEED_IMAGE_PLACEHOLDER,
    nidBackImage: SEED_IMAGE_PLACEHOLDER,
    nidSelfieImage: SEED_IMAGE_PLACEHOLDER,
    nidSubmittedAt: "2026-07-01T00:00:00.000Z",
    nidVerifiedAt: "2026-07-01T00:00:00.000Z",
    nidVerifiedBy: "System",
  },
  {
    id: MERCHANT_IDS.demo,
    businessName: "Kikuya Demo Store",
    ownerName: "Demo User",
    email: SEED_DEMO_CREDENTIALS.email,
    password: SEED_DEMO_CREDENTIALS.password,
    phone: "+8801700000000",
    address: "123 Demo Street, Dhaka 1212",
    status: "ACTIVE",
    businessType: "E-commerce",
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
    emailVerifiedAt: "2026-01-01T00:00:00.000Z",
    phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
    baseRate: 50,
    extraRatePerKg: 10,
    maxWeightKg: 10,
    freeWeightKg: 1,
    logoUrl: "/placeholder.svg",
    brandColor: "#f97316",
    hidePlatformBranding: false,
    approvedBy: "System",
    approvedAt: "2026-01-01T00:00:00.000Z",
    nidFrontImage: SEED_IMAGE_PLACEHOLDER,
    nidBackImage: SEED_IMAGE_PLACEHOLDER,
    nidSelfieImage: SEED_IMAGE_PLACEHOLDER,
    nidSubmittedAt: "2026-01-01T00:00:00.000Z",
    nidVerifiedAt: "2026-01-01T00:00:00.000Z",
    nidVerifiedBy: "System",
  },
]
