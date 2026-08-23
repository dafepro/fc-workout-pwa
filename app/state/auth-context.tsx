"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ClassicAppShell } from "../components/ClassicAppShell";
import { playerColor } from "../avatar/color";
import type { AvatarConfiguration } from "../avatar/types";
import { createAvatarGateway } from "../data/avatar-gateway";
import { CURRENT_PLAYER_ID, players } from "../data/mockData";
import type { Player } from "../domain/types";
import { TrainingProvider } from "./training-context";
import { copy } from "../content/copy";
import { routes } from "../content/routes";
import { AnalyticsProvider } from "../../lib/analytics/AnalyticsProvider";
import { AvatarIdentityProvider } from "./avatar-identity-context";
import { PlayerExperienceProvider } from "../player/PlayerExperienceProvider";
import { PlayerShell } from "../player/PlayerShell";

interface SessionProfile {
  accountId: string;
  role: string;
  developerControlsEnabled?: boolean;
  player: {
    id: string;
    firstName: string;
    lastInitial: string;
    teams: { id: string; name: string; timeZone: string }[];
    avatarConfiguration?: AvatarConfiguration;
  } | null;
}

interface AuthState {
  connected: boolean;
  developerControlsEnabled: boolean;
  session: SessionProfile | null;
  currentPlayerID: string;
  currentTeamID: string;
  currentPlayer: Player;
  avatarConfig: AvatarConfiguration;
  saveAvatar(config: AvatarConfiguration): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<
    | { status: "checking" }
    | { status: "local" }
    | { status: "connected"; session: SessionProfile }
    | { status: "unavailable" }
  >({ status: "checking" });
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfiguration>({});

  useEffect(() => {
    if (outsideThePlayerApp(pathname)) {
      return;
    }
    let active = true;
    void fetch("/api/auth/session", { cache: "no-store" }).then(
      async (response) => {
        if (!active) return;
        if (response.ok) {
          setState({
            status: "connected",
            session: (await response.json()) as SessionProfile,
          });
          return;
        }
        const body = (await response.json().catch(() => ({}))) as {
          error?: { code?: string };
        };
        if (
          response.status === 503 &&
          body.error?.code === "backend_not_configured"
        ) {
          setState({ status: "local" });
        } else if (response.status === 401) {
          router.replace(routes.playerSignIn);
        } else {
          setState({ status: "unavailable" });
        }
      },
      () => active && setState({ status: "unavailable" }),
    );
    return () => {
      active = false;
    };
  }, [pathname, router]);

  useEffect(() => {
    if (state.status !== "connected" && state.status !== "local") return;
    const gateway = createAvatarGateway(
      state.status === "connected",
      state.status === "connected"
        ? (state.session.player?.avatarConfiguration ?? {})
        : {},
    );
    let active = true;
    void gateway.load().then((config) => active && setAvatarConfig(config));
    return () => {
      active = false;
    };
  }, [state]);

  if (outsideThePlayerApp(pathname)) return <>{children}</>;
  if (state.status === "checking") {
    return <main className="auth-state">{copy.auth.opening}</main>;
  }
  if (state.status === "unavailable") {
    return (
      <main className="auth-state" role="alert">
        <h1>{copy.auth.unavailableTitle}</h1>
        <p>{copy.auth.unavailableBody}</p>
        <button
          className="button button--lime"
          onClick={() => location.reload()}
        >
          Try again
        </button>
      </main>
    );
  }
  const connected = state.status === "connected";
  const session = connected ? state.session : null;
  const currentPlayerID = session?.player?.id ?? CURRENT_PLAYER_ID;
  const prototypePlayer = players.find(
    (player) => player.id === CURRENT_PLAYER_ID,
  )!;
  const currentPlayer: Player = session?.player
    ? {
        id: currentPlayerID,
        firstName: session.player.firstName,
        lastInitial: `${session.player.lastInitial.replace(/\.$/, "")}.`,
        initials:
          `${session.player.firstName[0] ?? ""}${session.player.lastInitial[0] ?? ""}`.toUpperCase(),
        avatarColor: playerColor(currentPlayerID),
        weeklySessions: 0,
        effortPoints: 0,
        currentStreak: 0,
        consistency: 0,
      }
    : prototypePlayer;
  const currentTeamID = session?.player?.teams[0]?.id ?? "team-hill-striders";
  const auth: AuthState = {
    connected,
    developerControlsEnabled:
      session?.developerControlsEnabled ??
      process.env.NODE_ENV !== "production",
    session,
    currentPlayerID,
    currentTeamID,
    currentPlayer,
    avatarConfig,
    async saveAvatar(config) {
      setAvatarConfig(await createAvatarGateway(connected).save(config));
    },
    async signOut() {
      await fetch("/api/auth/session", { method: "DELETE" });
      router.replace(routes.playerSignIn);
    },
  };
  const insideMomentumAlpha =
    pathname === routes.momentumAlphaPrefix ||
    pathname.startsWith(`${routes.momentumAlphaPrefix}/`);
  const insideTeamCanvas =
    pathname === routes.teamCanvasPrefix ||
    pathname.startsWith(`${routes.teamCanvasPrefix}/`);
  const insideClassicAlpha =
    pathname === "/classic-alpha" || pathname.startsWith("/classic-alpha/");
  const insideClassicSupport =
    pathname === "/log" || pathname.startsWith("/sessions/");

  return (
    <AuthContext.Provider value={auth}>
      <AnalyticsProvider enabled={connected}>
        <AvatarIdentityProvider value={{ currentPlayerID, avatarConfig }}>
          <TrainingProvider
            connected={connected}
            currentPlayerID={currentPlayerID}
            currentTeamID={currentTeamID}
          >
            {insideMomentumAlpha || insideTeamCanvas ? (
              children
            ) : insideClassicAlpha || insideClassicSupport ? (
              <ClassicAppShell>{children}</ClassicAppShell>
            ) : (
              <PlayerExperienceProvider>
                <PlayerShell>{children}</PlayerShell>
              </PlayerExperienceProvider>
            )}
          </TrainingProvider>
        </AvatarIdentityProvider>
      </AnalyticsProvider>
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthGate");
  return value;
}

export function useOptionalAuth(): AuthState | null {
  return useContext(AuthContext);
}

/** The sign-in page and the staff console both authenticate for themselves, and
 * neither may be wrapped in the player shell. */
function outsideThePlayerApp(pathname: string): boolean {
  return (
    pathname === routes.playerSignIn ||
    pathname === routes.devAccess ||
    pathname.startsWith(routes.staffPrefix)
  );
}
