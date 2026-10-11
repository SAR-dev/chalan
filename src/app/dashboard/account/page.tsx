import { AccountSettings } from "@/features/account/components/account-settings"
import { getAppVersion } from "@/lib/version"

export default function DashboardAccountPage() {
  return <AccountSettings version={getAppVersion()} />
}
