export const devAccessCopy = {
  title: "Choose a preview account",
  intro:
    "These accounts contain invented preview data. Scan a player code or open its link, then enter the shared PIN.",
  playersTitle: "Player accounts",
  pinLabel: "PIN for every player",
  openPlayer: (name: string) => `Open ${name} sign-in`,
  adminTitle: "Staff access",
  adminIntro:
    "The preview administrator skips the production authenticator step.",
  emailLabel: "Email",
  passwordLabel: "Password",
  adminButton: "Sign in as administrator",
  signingIn: "Signing in…",
  adminError: "Administrator sign-in did not work. Try resetting the preview.",
} as const;
