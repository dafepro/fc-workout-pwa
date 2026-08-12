"use client";

import { useEffect, useRef, useState } from "react";

import { consoleCopy } from "./copy";
import { copyText, shareText } from "./share";
import type { CredentialReveal, StaffInvitation } from "./types";

/** Copy and share are the two ways these values leave the screen without being
 * transcribed by hand. Both report their result in one live region so a failure
 * is visible rather than looking like nothing happened. */
function CredentialActions({
  subject,
  text,
}: {
  subject: string;
  text: string;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const flash = (message: string | null, wasCopy: boolean) => {
    setNote(message);
    setCopied(wasCopy);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setNote(null);
      setCopied(false);
    }, 4000);
  };

  return (
    <>
      <div className="console-actions">
        <button
          type="button"
          className="button button--outline"
          onClick={async () => {
            const ok = await copyText(text);
            flash(
              ok ? consoleCopy.reveal.copied : consoleCopy.reveal.copyFailed,
              ok,
            );
          }}
        >
          {copied ? consoleCopy.reveal.copied : consoleCopy.reveal.copy}
        </button>
        <button
          type="button"
          className="button button--outline"
          onClick={async () => {
            const outcome = await shareText(subject, text);
            if (outcome === "cancelled") return;
            flash(
              outcome === "failed" ? consoleCopy.reveal.shareFailed : null,
              false,
            );
          }}
        >
          {consoleCopy.reveal.share}
        </button>
      </div>
      <p className="console-reveal__note" role="status" aria-live="polite">
        {note}
      </p>
    </>
  );
}

/** SEC-4. Whatever produced these values cannot produce them again, so the copy
 * says so plainly and the only control is an acknowledgement. */
export function CredentialRevealPanel({
  reveal,
  onDismiss,
}: {
  reveal: CredentialReveal;
  onDismiss: () => void;
}) {
  const shareBody = [
    `${consoleCopy.reveal.pinLabel}: ${reveal.pin}`,
    `${consoleCopy.reveal.linkLabel}: ${reveal.loginUrl}`,
  ].join("\n");

  return (
    <section className="console-card console-card--reveal" aria-live="polite">
      <h2 className="console-card__title">{consoleCopy.reveal.title}</h2>
      <p className="console-warning">{consoleCopy.reveal.warning}</p>
      <p className="console-reveal__pin">
        <span>{consoleCopy.reveal.pinLabel}</span>
        <strong>{reveal.pin}</strong>
      </p>
      {/* Rendered from the response bytes: the console adds no QR dependency,
          and a data URL must not be routed through the image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="console-reveal__qr"
        src={`data:image/png;base64,${reveal.qrPngBase64}`}
        alt={consoleCopy.reveal.qrAlt}
        width={220}
        height={220}
      />
      <dl className="console-facts">
        <dt>{consoleCopy.reveal.linkLabel}</dt>
        <dd className="console-facts__code">{reveal.loginUrl}</dd>
      </dl>
      <CredentialActions
        subject={consoleCopy.reveal.shareSubject}
        text={shareBody}
      />
      <button type="button" className="button button--lime" onClick={onDismiss}>
        {consoleCopy.reveal.done}
      </button>
    </section>
  );
}

export function InvitationPanel({
  invitation,
  onDismiss,
}: {
  invitation: StaffInvitation;
  onDismiss: () => void;
}) {
  const shareBody = [
    `${consoleCopy.accounts.setupUrlLabel}: ${invitation.setupUrl}`,
    `${consoleCopy.accounts.temporaryPasswordLabel}: ${invitation.temporaryPassword}`,
    `${consoleCopy.accounts.expiresAt}: ${invitation.expiresAt}`,
  ].join("\n");

  return (
    <section className="console-card console-card--reveal" aria-live="polite">
      <h2 className="console-card__title">
        {consoleCopy.accounts.invitationTitle}
      </h2>
      <p className="console-warning">
        {consoleCopy.accounts.invitationWarning}
      </p>
      <dl className="console-facts">
        <dt>{consoleCopy.accounts.emailLabel}</dt>
        <dd>{invitation.email}</dd>
        <dt>{consoleCopy.accounts.setupUrlLabel}</dt>
        <dd className="console-facts__code">{invitation.setupUrl}</dd>
        <dt>{consoleCopy.accounts.temporaryPasswordLabel}</dt>
        <dd className="console-facts__code">{invitation.temporaryPassword}</dd>
        <dt>{consoleCopy.accounts.expiresAt}</dt>
        <dd>{invitation.expiresAt}</dd>
      </dl>
      <CredentialActions
        subject={consoleCopy.reveal.invitationShareSubject}
        text={shareBody}
      />
      <button type="button" className="button button--lime" onClick={onDismiss}>
        {consoleCopy.reveal.done}
      </button>
    </section>
  );
}
