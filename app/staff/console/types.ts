/** The shapes the staff API returns. Kept in the console tree so no player
 * module can reach them (REQ-401). */

export type CredentialState = "none" | "active" | "locked" | "revoked";

export interface RosterEntry {
  playerId: string;
  firstName: string;
  lastInitial: string;
  accountId: string;
  accountStatus: string;
  credentialState: CredentialState;
  membershipFrom: string;
  membershipTo?: string;
  lastActivityOn?: string;
}

export interface TeamSummary {
  id: string;
  clubId: string;
  clubName: string;
  name: string;
  seasonId: string;
  timeZone: string;
  weeklyGoal: number;
  playerCount: number;
}

export interface ClubSummary {
  id: string;
  name: string;
  teamCount: number;
  createdAt: string;
}

export interface StaffSession {
  accountId: string;
  role: string;
  email: string;
  expiresAt: string;
}

export interface PlayerMembership {
  teamId: string;
  teamName: string;
  activeFrom: string;
  activeTo?: string;
}

export interface CredentialDetail {
  state: CredentialState;
  issuedAt?: string;
  lastUsedAt?: string;
  lockedUntil?: string;
  failedAttempts: number;
  activeSessions: number;
}

export interface AuthEvent {
  occurredAt: string;
  eventType: string;
  detail?: string;
}

export interface PlayerDetail {
  player: { id: string; firstName: string; lastInitial: string };
  clubId: string;
  clubName: string;
  memberships: PlayerMembership[];
  credential: CredentialDetail;
  recentAuthEvents: AuthEvent[];
}

/** A one-time reveal. Never re-readable, never logged (SEC-4). */
export interface CredentialReveal {
  playerId?: string;
  accountId?: string;
  pin: string;
  loginUrl: string;
  qrPngBase64: string;
}

export interface StaffAccount {
  accountId: string;
  email: string;
  role: string;
  clubId?: string;
  status: string;
  setupComplete: boolean;
  lastUsedAt?: string;
}

/** Also a one-time reveal: the operator hands it over out of band. */
export interface StaffInvitation {
  accountId: string;
  email: string;
  role: string;
  setupUrl: string;
  setupToken: string;
  temporaryPassword: string;
  expiresAt: string;
}

export interface AuditEvent {
  occurredAt: string;
  actorAccountId: string;
  action: string;
  targetType: string;
  targetId: string;
  detail?: string;
}
