import { BusinessSettings } from "@/components/settings/business-settings";
import { FingerprintSetting } from "@/components/settings/fingerprint-setting";
import { ThemeSetting } from "@/components/settings/theme-setting";
import { FormHelpSetting } from "@/components/shell/form-help-setting";
import { dhakaToday, formatDate } from "@mbl/domain/dates";
import { getUser } from "@/lib/supabase/server";
import { getProfile } from "@/server/auth";
import { getBusiness, logoSrc } from "@/server/business";
import { loadPasskeys } from "@/server/passkeys";

// UIDD §4.13: Theme (per user, D-037), Form help (per device), Business (D-039: Details ·
// Logo · Messages) and Fingerprint unlock (D-046: this user's devices).
export default async function SettingsPage() {
  const user = await getUser();
  const [profile, business, keys] = await Promise.all([
    getProfile(),
    getBusiness(),
    user ? loadPasskeys(user.id) : [],
  ]);
  const devices = keys.map((k) => ({
    id: k.id,
    name: k.deviceName ?? "This device",
    added: formatDate(dhakaToday(k.createdAt)),
    updatedAt: k.updatedAt.toISOString(),
  }));
  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Settings</h1>
      <div className="flex max-w-xl flex-col gap-6">
        {profile && (
          <ThemeSetting
            id={profile.id}
            updatedAt={profile.updatedAt.toISOString()}
            theme={profile.theme}
          />
        )}
        <FormHelpSetting />
        {business && <BusinessSettings business={business} logo={logoSrc(business)} />}
        <FingerprintSetting devices={devices} />
      </div>
    </>
  );
}
