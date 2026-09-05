"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PlayerShell } from "../player/PlayerShell";
import type { AvatarConfiguration } from "../avatar/types";
import {
  createConnectedPlayerRuntime,
  parseConnectedSession,
  type PlayerRuntimeAdapter,
  type SessionProfile,
} from "../data/player-runtime";
import type { Player } from "../domain/types";
import { TrainingProvider } from "./training-context";
import { copy } from "../content/copy";
import { routes } from "../content/routes";
import { AnalyticsProvider } from "../../lib/analytics/AnalyticsProvider";
import { AvatarIdentityProvider } from "./avatar-identity-context";

interface AuthState {
  connected: boolean;
  session: SessionProfile | null;
  runtime: PlayerRuntimeAdapter;
  currentPlayerID: string;
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
    | { status: "ready"; runtime: PlayerRuntimeAdapter }
    | { status: "unavailable" }
  >({ status: "checking" });
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfiguration>({});

  useEffect(() => {
    if (outsideThePlayerApp(pathname)) {
      return;
    }
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        if (!active) return;
        if (response.ok) {
          const session = parseConnectedSession(await response.json());
          setState(
            session
              ? {
                  status: "ready",
                  runtime: createConnectedPlayerRuntime(session),
                }
              : { status: "unavailable" },
          );
          return;
        }
        const body = (await response.json().catch(() => ({}))) as {
          error?: { code?: string };
        };
        if (
          response.status === 503 &&
          body.error?.code === "backend_not_configured"
        ) {
          const { createUnhostedPrototypeRuntime } = await import(
            "../prototype/unhosted-player-runtime"
          );
          if (active) {
            setState({
              status: "ready",
              runtime: createUnhostedPrototypeRuntime(),
            });
          }
        } else if (response.status === 401) {
          router.replace(routes.playerSignIn);
        } else {
          setState({ status: "unavailable" });
        }
      } catch {
        if (active) setState({ status: "unavailable" });
      }
    })();
    return () => {
      active = false;
    };
  }, [pathname, router]);

  useEffect(() => {
    if (state.status !== "ready") return;
    let active = true;
    void state.runtime.avatar
      .load()
      .then((config) => active && setAvatarConfig(config));
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
  const runtime = state.runtime;
  const connected = runtime.mode === "connected";
  const { session, currentPlayerID, currentPlayer } = runtime;
  const auth: AuthState = {
    connected,
    session,
    runtime,
    currentPlayerID,
    currentPlayer,
    avatarConfig,
    async saveAvatar(config) {
      setAvatarConfig(await runtime.avatar.save(config));
    },
    async signOut() {
      await fetch("/api/auth/session", { method: "DELETE" });
      router.replace(routes.playerSignIn);
    },
  };
  return (
    <AuthContext.Provider value={auth}>
      <AnalyticsProvider enabled={connected}>
        <AvatarIdentityProvider value={{ currentPlayerID, avatarConfig }}>
          <TrainingProvider runtime={runtime}>
            <PlayerShell>{children}</PlayerShell>
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
    pathname === routes.avatar3dDemo ||
    pathname.startsWith(routes.staffPrefix)
  );
}
