/** Handing credentials to a person means getting them off this screen and onto
 * theirs. Both paths are best-effort: every one of these APIs is missing or
 * refused somewhere, so each reports whether it worked and the panel says so
 * rather than failing silently and leaving the operator to guess. */

export async function copyText(text: string): Promise<boolean> {
  // The async clipboard needs a secure context, which the console has in
  // production but not on a plain-http device on the LAN.
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the older path rather than give up.
    }
  }

  try {
    const holder = document.createElement("textarea");
    holder.value = text;
    // Off-screen but still focusable: execCommand ignores hidden elements.
    holder.setAttribute("readonly", "");
    holder.style.position = "fixed";
    holder.style.top = "-1000px";
    holder.style.opacity = "0";
    document.body.appendChild(holder);
    holder.select();
    const copied = document.execCommand("copy");
    holder.remove();
    return copied;
  } catch {
    return false;
  }
}

export type ShareOutcome = "shared" | "cancelled" | "failed";

/** Prefers the device share sheet, which is where a phone's mail, messages and
 * password manager live. Falls back to a mail draft so a desktop operator is
 * not stuck. */
export async function shareText(
  subject: string,
  text: string,
): Promise<ShareOutcome> {
  if (navigator.share) {
    try {
      await navigator.share({ title: subject, text });
      return "shared";
    } catch (error) {
      // Dismissing the sheet is a decision, not a fault.
      if (error instanceof Error && error.name === "AbortError") {
        return "cancelled";
      }
      return "failed";
    }
  }

  try {
    const href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    window.location.href = href;
    return "shared";
  } catch {
    return "failed";
  }
}
