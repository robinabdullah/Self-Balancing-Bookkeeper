import { BusinessSettings } from "@/components/settings/business-settings";
import { FingerprintSetting } from "@/components/settings/fingerprint-setting";
import { ThemeSetting } from "@/components/settings/theme-setting";
import { FormHelpSetting } from "@/components/shell/form-help-setting";
import type { SettingsView } from "@mbl/api/views/admin.controller";
import { api } from "@/api/client";

// UIDD §4.13: Theme (per user, D-037), Form help (per device), Business (D-039: Details ·
// Logo · Messages) and Fingerprint unlock (D-046: this user's devices). N-4.6: one
// `/views/settings` read; the device rows and the profile arrive with their dates as text.
export default async function SettingsPage() {
  const { profile, business, logo, devices } = await api<SettingsView>("/views/settings");
  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Settings</h1>
      <div className="flex max-w-xl flex-col gap-6">
        {profile && (
          <ThemeSetting id={profile.id} updatedAt={profile.updatedAt} theme={profile.theme} />
        )}
        <FormHelpSetting />
        {business && <BusinessSettings business={business} logo={logo} />}
        <FingerprintSetting devices={devices} />
      </div>
    </>
  );
}
