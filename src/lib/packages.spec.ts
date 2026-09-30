import { describe, expect, it } from "vitest"
import {
  applyPackageRule,
  nextTierForCount,
  pickTierForCount,
  tierLabel,
} from "@/lib/packages"

const tiers = [
  {
    id: "t1",
    orderCount: 10,
    sortOrder: 0,
    ruleType: "PERCENT_OFF" as const,
    ruleValue: 10,
  },
  {
    id: "t2",
    orderCount: 50,
    sortOrder: 1,
    ruleType: "FLAT" as const,
    ruleValue: 50,
  },
  {
    id: "t3",
    orderCount: 100,
    sortOrder: 2,
    ruleType: "PERCENT_OFF" as const,
    ruleValue: 25,
  },
]

describe("pickTierForCount", () => {
  it("returns null before the first tier is unlocked", () => {
    expect(pickTierForCount(tiers, 0)).toBeNull()
    expect(pickTierForCount(tiers, 9)).toBeNull()
  })

  it("unlocks a tier exactly at its threshold", () => {
    expect(pickTierForCount(tiers, 10)?.id).toBe("t1")
    expect(pickTierForCount(tiers, 50)?.id).toBe("t2")
  })

  it("returns the highest unlocked tier between thresholds", () => {
    expect(pickTierForCount(tiers, 49)?.id).toBe("t1")
    expect(pickTierForCount(tiers, 99)?.id).toBe("t2")
    expect(pickTierForCount(tiers, 500)?.id).toBe("t3")
  })

  it("handles an empty tier list", () => {
    expect(pickTierForCount([], 100)).toBeNull()
  })

  it("does not assume the tiers are sorted", () => {
    const shuffled = [tiers[2], tiers[0], tiers[1]]
    expect(pickTierForCount(shuffled, 60)?.id).toBe("t2")
  })
})

describe("nextTierForCount", () => {
  it("returns the lowest tier above the count", () => {
    expect(nextTierForCount(tiers, 0)?.id).toBe("t1")
    expect(nextTierForCount(tiers, 10)?.id).toBe("t2")
    expect(nextTierForCount(tiers, 99)?.id).toBe("t3")
  })

  it("returns null once the top tier is reached", () => {
    expect(nextTierForCount(tiers, 100)).toBeNull()
  })
})

describe("applyPackageRule", () => {
  it("returns the zone fee unchanged when there is no rule", () => {
    expect(applyPackageRule(80, null)).toBe(80)
    expect(applyPackageRule(80, undefined)).toBe(80)
  })

  it("FLAT overrides the fee when it is below the zone fee", () => {
    expect(applyPackageRule(80, { ruleType: "FLAT", ruleValue: 50 })).toBe(50)
  })

  it("FLAT never charges more than the zone fee", () => {
    expect(applyPackageRule(30, { ruleType: "FLAT", ruleValue: 50 })).toBe(30)
  })

  it("FLAT is clamped at zero for negative values", () => {
    expect(applyPackageRule(80, { ruleType: "FLAT", ruleValue: -10 })).toBe(0)
  })

  it("PERCENT_OFF reduces the fee", () => {
    expect(
      applyPackageRule(80, { ruleType: "PERCENT_OFF", ruleValue: 25 }),
    ).toBe(60)
  })

  it("PERCENT_OFF clamps to 0-100", () => {
    expect(
      applyPackageRule(80, { ruleType: "PERCENT_OFF", ruleValue: 150 }),
    ).toBe(0)
    expect(
      applyPackageRule(80, { ruleType: "PERCENT_OFF", ruleValue: -20 }),
    ).toBe(80)
  })

  it("rounds the result to paisa", () => {
    expect(
      applyPackageRule(33.33, { ruleType: "PERCENT_OFF", ruleValue: 10 }),
    ).toBe(30)
  })
})

describe("tierLabel", () => {
  it("describes a flat rule", () => {
    const label = tierLabel({ ruleType: "FLAT", ruleValue: 50 })
    expect(label).toContain("Flat")
    expect(label).toContain("50")
  })

  it("describes a percentage rule", () => {
    expect(tierLabel({ ruleType: "PERCENT_OFF", ruleValue: 10 })).toContain(
      "10%",
    )
  })
})
