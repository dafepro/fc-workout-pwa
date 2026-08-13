/** Shared route literals. Kept out of the console tree so the player bundle can
 * name the staff entry without importing any console code. */
export const routes = {
  playerHome: "/",
  playerSignIn: "/login",
  staffPrefix: "/staff",
  staffSignIn: "/staff/sign-in",
  staffSetup: "/staff/setup",
  staffConsoleHome: "/staff",
  staffAdmin: "/staff/admin",
  staffAdminClubs: "/staff/admin/clubs",
  staffAdminTeams: "/staff/admin/teams",
  staffAdminAccounts: "/staff/admin/accounts",
  staffAdminAudit: "/staff/admin/audit",
  staffAdminTeam: (teamId: string) => `/staff/admin/teams/${teamId}`,
  staffAdminTeamProgress: (teamId: string) =>
    `/staff/admin/teams/${teamId}/progress`,
  staffAdminTeamRoster: (teamId: string) =>
    `/staff/admin/teams/${teamId}/roster`,
  staffAdminPlayer: (playerId: string) => `/staff/admin/players/${playerId}`,
  staffTeam: (teamId: string) => `/staff/teams/${teamId}`,
  staffTeamProgress: (teamId: string) => `/staff/teams/${teamId}/progress`,
  staffTeamRoster: (teamId: string) => `/staff/teams/${teamId}/roster`,
  staffPlayer: (playerId: string) => `/staff/players/${playerId}`,
} as const;
