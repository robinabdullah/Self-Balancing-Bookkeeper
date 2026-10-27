"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormModal } from "@/components/forms/form-modal";
import { BusinessLogo } from "@/components/shell/business-logo";
import { saveLogo } from "@/server/actions/business";

// UIDD §4.13 (D-039): the logo is resized on the phone to at most 256 px (a PNG data URL), so
// no file storage is needed. Remove clears it.

const MAX = 256;

async function resize(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

type Shell = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meta: Record<string, string>;
  onSaved: (r: { updatedAt: string | null }) => void;
};

export function LogoForm({ current, ...shell }: Shell & { current: string | null }) {
  // undefined = unchanged; "" = removed; a data URL = the new image.
  const [logo, setLogo] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const shown = logo === undefined ? current : logo || null;

  const choose = async (file: File | undefined) => {
    if (!file) return;
    try {
      setLogo(await resize(file));
      setError(null);
    } catch {
      setError("That file isn't an image");
    }
  };

  return (
    <FormModal
      {...shell}
      onOpenChange={(o) => {
        if (!o) setLogo(undefined);
        shell.onOpenChange(o);
      }}
      title="Logo"
      submit={async (fields) =>
        logo === undefined
          ? { status: "invalid", errors: { form: "Choose an image, or Remove" } }
          : saveLogo({ ...fields, logo })
      }
    >
      <div className="flex items-center gap-3">
        {shown ? (
          <BusinessLogo src={shown} size={96} />
        ) : (
          <p className="text-muted-foreground text-sm">No logo</p>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Logo image"
        onChange={(e) => choose(e.target.files?.[0])}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 px-4"
          onClick={() => input.current?.click()}
        >
          Choose image
        </Button>
        {shown && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 px-4"
            onClick={() => setLogo("")}
          >
            Remove
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <p className="text-muted-foreground text-xs">Resized to 256 px on this device.</p>
    </FormModal>
  );
}
