"use client";

import { useState } from "react";
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { FingerprintIcon, Trash2Icon } from "lucide-react";
import { TextField } from "@/components/forms/field";
import { FormModal } from "@/components/forms/form-modal";
import { useHydrated } from "@/components/forms/use-hydrated";
import { Button } from "@/components/ui/button";
import type { Result } from "@/server/action";
import {
  fingerprintSetupOptions,
  registerFingerprint,
  removeFingerprint,
} from "@/server/actions/passkeys";

export type Device = { id: string; name: string; added: string; updatedAt: string };

/** Set-up: the password, then the phone's fingerprint, then the server checks and saves it. */
async function setUp(input: Record<string, unknown>): Promise<Result> {
  const step1 = await fingerprintSetupOptions({ password: input.password });
  if (step1.status !== "ok") return step1;
  let response;
  try {
    response = await startRegistration({ optionsJSON: step1.options });
  } catch {
    return { status: "invalid", errors: { form: "Fingerprint set-up was cancelled" } };
  }
  return registerFingerprint(response);
}

// D-046 (UIDD §4.13): Settings → Fingerprint unlock: this user's devices and Set up on this
// device (the login password first). The fingerprint reveals saved card details.
export function FingerprintSetting({ devices }: { devices: Device[] }) {
  const supported = useHydrated() && browserSupportsWebAuthn();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Device | null>(null);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Fingerprint unlock</legend>
      {devices.length === 0 ? (
        <p className="text-muted-foreground text-sm">Not set up on any device yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-lg border py-1 pr-1 pl-3">
              <FingerprintIcon className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 text-sm">
                {d.name} <span className="text-muted-foreground">· added {d.added}</span>
              </span>
              <Button
                variant="ghost"
                className="size-11"
                aria-label={`Remove ${d.name}`}
                onClick={() => setRemoving(d)}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {supported ? (
        <Button
          variant="outline"
          className="min-h-11 self-start px-3"
          onClick={() => setAdding(true)}
        >
          <FingerprintIcon /> Set up on this device
        </Button>
      ) : (
        <p className="text-muted-foreground text-sm">
          This browser can&apos;t use fingerprint unlock.
        </p>
      )}
      <p className="text-muted-foreground text-xs">
        Your fingerprint reveals saved card details (Saved details → Cards).
      </p>
      <FormModal
        open={adding}
        onOpenChange={setAdding}
        title="Set up fingerprint unlock"
        about="fingerprint_setup"
        meta={{}}
        submit={setUp}
        submitLabel="Continue"
        savedMessage="Fingerprint set up"
      >
        <TextField
          label="Your login password"
          name="password"
          type="password"
          autoComplete="current-password"
        />
      </FormModal>
      <FormModal
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this device?"
        meta={removing ? { id: removing.id, updatedAt: removing.updatedAt } : {}}
        submit={removeFingerprint}
        submitLabel="Remove"
        savedMessage="Removed"
      >
        <p className="text-sm">
          {removing?.name} can no longer reveal card details with a fingerprint.
        </p>
      </FormModal>
    </fieldset>
  );
}
