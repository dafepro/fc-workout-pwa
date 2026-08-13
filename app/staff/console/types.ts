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
  /** Empty for anything with no signed-in account behind it, which is every
   * break-glass CLI action. Read it with actorSource, never alone. */
  actorAccountId: string;
  actorSource: string;
  action: string;
  targetType: string;
  targetId: string;
  detail?: string;
}

export interface AssignmentCatalogEntry {
  key: string;
  displayName: string;
  activityDefinitionId: string;
  defaultTargetValue: number;
  defaultTargetUnit: string;
}

export interface AssignmentSummary {
  id: string;
  catalogKey: string;
  activityName: string;
  targetValue: number;
  targetUnit: string;
  startsOn: string;
  dueOn: string;
  createdAt: string;
}

export interface PlayerCompletion {
  playerId: string;
  firstName: string;
  lastInitial: string;
}

export interface AssignmentCompletion {
  assignment?: AssignmentSummary;
  completed: PlayerCompletion[];
  oneAway: PlayerCompletion[];
  keepGoing: PlayerCompletion[];
}

/** The team projection the players' own Team screen reads, served to staff by
 * `GET v1/staff/teams/{id}/progress` (REQ-516). Same shape, same numbers. */
export interface TeamProgressMember {
  playerId: string;
  firstName: string;
  lastInitial: string;
  weeklySessions: number;
  effortPoints: number;
  currentStreak: number;
  consistencyDays: number;
  goalStatus: "completed" | "one_away" | "keep_going";
  challengeCompleted: boolean;
}

export interface TeamProgress {
  team: { id: string; name: string; weeklyGoal: number };
  weekStart: string;
  weekEnd: string;
  teamSessions: number;
  membersMeetingGoal: number;
  currentChallenge: { activityName: string; completedCount: number } | null;
  members: TeamProgressMember[];
}
