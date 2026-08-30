/** Shared route literals. Kept out of the console tree so the player bundle can
 * name the staff entry without importing any console code. */
export const routes = {
  playerHome: "/",
  playerAvatar: "/me/avatar",
  playerPrizes: "/prizes",
  playerTeam: "/team",
  playerSignIn: "/login",
  devAccess: "/dev-access",
  staffPrefix: "/staff",
  staffSignIn: "/staff/sign-in",
  staffSetup: "/staff/setup",
  staffConsoleHome: "/staff",
  staffAdmin: "/staff/admin",
  staffAdminClubs: "/staff/admin/clubs",
  staffAdminTeams: "/staff/admin/teams",
  staffAdminAccounts: "/staff/admin/accounts",
  staffAdminAudit: "/staff/admin/audit",
  staffAdminAnalytics: "/staff/admin/analytics",
  staffAdminTeam: (teamId: string) => `/staff/admin/teams/${teamId}`,
  staffAdminTeamProgress: (teamId: string) =>
    `/staff/admin/teams/${teamId}/progress`,
  staffAdminTeamRoster: (teamId: string) =>
    `/staff/admin/teams/${teamId}/roster`,
  staffAdminTeamRewards: (teamId: string) =>
    `/staff/admin/teams/${teamId}/rewards`,
  // The bases are here because a server component may not hand a function to a
  // client one: `playerHref={routes.staffPlayer}` crashed the page it was on.
  staffAdminPlayers: "/staff/admin/players",
  staffAdminPlayer: (playerId: string) => `/staff/admin/players/${playerId}`,
  staffTeam: (teamId: string) => `/staff/teams/${teamId}`,
  staffTeamProgress: (teamId: string) => `/staff/teams/${teamId}/progress`,
  staffTeamRoster: (teamId: string) => `/staff/teams/${teamId}/roster`,
  staffTeamRewards: (teamId: string) => `/staff/teams/${teamId}/rewards`,
  staffPlayers: "/staff/players",
  staffPlayer: (playerId: string) => `/staff/players/${playerId}`,
} as const;
