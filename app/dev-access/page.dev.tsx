import { notFound } from "next/navigation";
import Image from "next/image";
import {
  backendBaseURL,
  backendHeaders,
  devAccessEnabled,
} from "../api/backend";
import { LoginMasthead } from "../components/LoginMasthead";
import { DevAdminSignIn } from "./DevAdminSignIn";
import { devAccessCopy } from "./copy";

interface DevAccess {
  players: { name: string; loginUrl: string; qrPngBase64?: string }[];
  pin: string;
  adminEmail: string;
  adminPassword: string;
}

export const dynamic = "force-dynamic";

export default async function DevAccessPage() {
  if (!devAccessEnabled()) notFound();
  const baseURL = backendBaseURL();
  if (!baseURL) notFound();
  const response = await fetch(`${baseURL}/__dev/access`, {
    headers: backendHeaders(),
    cache: "no-store",
  });
  if (!response.ok) notFound();
  const access = (await response.json()) as DevAccess;

  return (
    <main className="login-page dev-access-page">
      <section
        className="login-card dev-access-card"
        aria-labelledby="dev-access-title"
      >
        <LoginMasthead />
        <h1 id="dev-access-title">{devAccessCopy.title}</h1>
        <p>{devAccessCopy.intro}</p>

        <h2>{devAccessCopy.playersTitle}</h2>
        <p className="dev-access-pin">
          {devAccessCopy.pinLabel}: <strong>{access.pin}</strong>
        </p>
        <ul className="dev-player-list">
          {access.players.map((player) => (
            <li key={player.name}>
              <h3>{player.name}</h3>
              {player.qrPngBase64 ? (
                <Image
                  src={`data:image/png;base64,${player.qrPngBase64}`}
                  alt={`QR sign-in code for ${player.name}`}
                  width="192"
                  height="192"
                  unoptimized
                />
              ) : null}
              <a className="button button--outline" href={player.loginUrl}>
                {devAccessCopy.openPlayer}
              </a>
            </li>
          ))}
        </ul>

        <div className="dev-admin-card">
          <h2>{devAccessCopy.adminTitle}</h2>
          <p>{devAccessCopy.adminIntro}</p>
          <dl>
            <div>
              <dt>{devAccessCopy.emailLabel}</dt>
              <dd>{access.adminEmail}</dd>
            </div>
            <div>
              <dt>{devAccessCopy.passwordLabel}</dt>
              <dd>{access.adminPassword}</dd>
            </div>
          </dl>
          <DevAdminSignIn
            email={access.adminEmail}
            password={access.adminPassword}
          />
        </div>
      </section>
    </main>
  );
}
