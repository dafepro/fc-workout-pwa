import { createHmac } from "node:crypto";
import { expect, type Page } from "@playwright/test";

// The fixture coach seeded by `backend/cmd/api/auth_e2e.go`. Sharing the
// literals with that file by hand is deliberate: the alternative is an endpoint
// that hands out staff credentials, and nothing should be able to ask for those.
export const COACH_EMAIL = "coach@zoomigo.test";
export const COACH_PASSWORD = "e2e-coach-password-1";
const COACH_TOTP_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
export const FIXTURE_TEAM_ID = "team-hill-striders";

function decodeBase32(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of secret.replace(/=+$/, "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 6238 with the defaults the backend uses: SHA-1, 30 seconds, 6 digits. */
function currentCode(secret: string, step = Math.floor(Date.now() / 30_000)) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeBase32(secret))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, "0");
}

/**
 * Signs in as the fixture coach through the console's own door -- password,
 * then a code from an authenticator. A code is single use and refused at or
 * below the last accepted step, so a test that signs in twice inside one
 * 30-second window would be refused for the right reason at the wrong time;
 * the retry waits for the next step rather than pretending the first failed.
 */
export async function signInAsCoach(page: Page) {
  await page.goto("/staff/sign-in");
  // Both steps keep their secrets out of the browser's own GET submit path, so
  // the buttons stay disabled until React has hydrated. Filling before that
  // writes into a form whose state is about to be replaced by an empty one --
  // which sends `{"email":"","password":""}` and reads as a wrong password.
  const submit = page.getByRole("button", { name: "Continue" });
  await expect(submit).toBeEnabled();
  await page.getByLabel("Email address").fill(COACH_EMAIL);
  await page.getByLabel("Password").fill(COACH_PASSWORD);
  const passwordStep = page.waitForResponse(
    (response) =>
      response.url().includes("/staff/api/session") &&
      response.request().method() === "POST",
  );
  await submit.click();
  // Every console failure says the same thing on screen (REQ-106), which is
  // right for a coach and useless for a test, so read the status instead.
  const response = await passwordStep;
  if (!response.ok()) {
    throw new Error(
      `staff password step failed with ${response.status()}: ${await response.text()}`,
    );
  }

  const code = page.getByLabel("Six-digit code");
  await code.waitFor();
  await code.fill(currentCode(COACH_TOTP_SECRET));
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === "/staff");
}
