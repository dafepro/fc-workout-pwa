/** Shared route literals. Kept out of the console tree so the player bundle can
 * name the staff entry without importing any console code. */
export const routes = {
  playerHome: "/",
  playerSignIn: "/login",
  staffPrefix: "/staff",
  staffSignIn: "/staff/sign-in",
  staffSetup: "/staff/setup",
  staffConsoleHome: "/staff",
} as const;
