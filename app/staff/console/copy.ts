/** Console copy, kept out of `copy.ts` so the player bundle does not carry
 * wording only a coach or an operator will ever read (REQ-401). */
export const staffCopy = {
  signInTitle: "Coach and staff sign in",
  signInIntro:
    "This page is for coaches and staff. Players sign in by scanning their QR code.",
  playerLink: "Player sign in",
  emailLabel: "Email address",
  passwordLabel: "Password",
  continue: "Continue",
  working: "Working…",
  back: "Back",
  codeTitle: "Enter your authenticator code",
  codeIntro:
    "Open the authenticator app you enrolled and enter the six-digit code it shows for ZoomiGo.",
  codeLabel: "Six-digit code",
  signIn: "Sign in",
  // One message for every failure, so that guessing at addresses never
  // reveals which staff accounts exist (REQ-106).
  signInFailed: "That did not work. Check the details and try again.",
  tooManyAttempts: "Too many attempts. Wait a few minutes and try again.",
  setupRequiredTitle: "Finish setting up your account",
  setupRequiredBody:
    "This account still needs a password and an authenticator. Open the one-time setup link the operator gave you, exactly as it was given, including everything after the #.",
  setup: {
    title: "Set up your staff account",
    intro:
      "You need the temporary password the operator gave you and an authenticator app on your phone.",
    missingToken:
      "This page needs the one-time setup link. Open the link the operator gave you exactly as it was given, including everything after the #.",
    temporaryPasswordLabel: "Temporary password",
    enrollTitle: "Add ZoomiGo to your authenticator",
    enrollIntro:
      "Add this account to your authenticator app using the setup key below, then choose a password and enter the code the app shows.",
    accountLabel: "Account",
    secretLabel: "Setup key",
    uriLabel: "Or open this in your authenticator app",
    newPasswordLabel: "New password",
    confirmPasswordLabel: "Repeat new password",
    passwordRule: "Use at least 12 characters.",
    passwordTooShort: "Use at least 12 characters.",
    passwordMismatch: "The two passwords do not match.",
    codeRule: "Enter the six-digit code from your authenticator.",
    finish: "Finish setup",
    failed: "That did not work. Check the details and try again.",
    recoveryTitle: "Save your recovery codes",
    recoveryBody:
      "These codes are shown only now and can never be shown again. Save them somewhere safe. Each one can be used once if you lose your authenticator.",
    recoveryAcknowledge: "I have saved these codes somewhere safe",
    recoveryContinue: "Continue to the console",
  },
} as const;
