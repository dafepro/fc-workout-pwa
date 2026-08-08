"use client";

import { copy } from "../../content/copy";
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
      <h2 className="console-card__title">{copy.console.reveal.title}</h2>
      <p className="console-warning">{copy.console.reveal.warning}</p>
      <p className="console-reveal__pin">
        <span>{copy.console.reveal.pinLabel}</span>
        <strong>{reveal.pin}</strong>
      </p>
      {/* Rendered from the response bytes: the console adds no QR dependency,
          and a data URL must not be routed through the image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="console-reveal__qr"
        src={`data:image/png;base64,${reveal.qrPngBase64}`}
        alt={copy.console.reveal.qrAlt}
        width={220}
        height={220}
      />
      <dl className="console-facts">
        <dt>{copy.console.reveal.linkLabel}</dt>
        <dd className="console-facts__code">{reveal.loginUrl}</dd>
      </dl>
      <button type="button" className="button button--lime" onClick={onDismiss}>
        {copy.console.reveal.done}
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
        {copy.console.accounts.invitationTitle}
      </h2>
      <p className="console-warning">
        {copy.console.accounts.invitationWarning}
      </p>
      <dl className="console-facts">
        <dt>{copy.console.accounts.emailLabel}</dt>
        <dd>{invitation.email}</dd>
        <dt>{copy.console.accounts.setupUrlLabel}</dt>
        <dd className="console-facts__code">{invitation.setupUrl}</dd>
        <dt>{copy.console.accounts.temporaryPasswordLabel}</dt>
        <dd className="console-facts__code">{invitation.temporaryPassword}</dd>
        <dt>{copy.console.accounts.expiresAt}</dt>
        <dd>{invitation.expiresAt}</dd>
      </dl>
      <button type="button" className="button button--lime" onClick={onDismiss}>
        {copy.console.reveal.done}
      </button>
    </section>
  );
}
