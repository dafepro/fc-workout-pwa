"use client";

import { consoleCopy } from "./copy";
import type { CredentialReveal, StaffInvitation } from "./types";

/** SEC-4. Whatever produced these values cannot produce them again, so the copy
 * says so plainly and the only control is an acknowledgement. */
export function CredentialRevealPanel({
  reveal,
  onDismiss,
}: {
  reveal: CredentialReveal;
  onDismiss: () => void;
}) {
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
      <button type="button" className="button button--lime" onClick={onDismiss}>
        {consoleCopy.reveal.done}
      </button>
    </section>
  );
}
