"use client";

// D-039: copy a saved detail, or share it through the phone's share sheet. A computer has no
// share sheet for text, so Share opens WhatsApp Web with the text instead.

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareText(text: string) {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
    } catch {
      // Cancelled in the share sheet: nothing to do.
    }
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}
