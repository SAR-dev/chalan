import { AccountSettings } from "@/features/account/components/account-settings"
import { getAppVersion } from "@/lib/version"

export default function WarehouseAccountPage() {
  return <AccountSettings version={getAppVersion()} />
}
