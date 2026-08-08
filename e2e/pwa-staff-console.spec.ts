import { expect, test } from "@playwright/test";

// The gate key the local Worker binding falls back to when the environment does
// not set one; see `localBindingConfig` in vite.config.ts.
const localGatePhrase = "local-staff-gate";

// REQ-402: the gate is refused before the application renders anything, which
// is only observable through the real Worker request path -- so it is checked
// here rather than only in the unit tests for the gate itself.
test("the console path is gated before the application renders", async ({
  page,
}) => {
  await page.goto("/staff/admin");
  await expect(page).toHaveURL(/\/staff\/gate$/);
  await expect(page.getByRole("heading", { name: "Restricted" })).toBeVisible();
  // The gate says nothing about what is behind it.
  await expect(page.getByText(/ZoomiGo/i)).toHaveCount(0);

  await page.getByLabel("Passphrase").fill("not-the-phrase");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toContainText("not the phrase");
});

// REQ-106 and REQ-403 for the surfaces phases 0-2 ship: the staff door names
// who it is for, asks for a password before a code, offers no remembered
// device, and works on the narrowest phone.
test("staff sign-in works at 320 pixels and offers no remembered device", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/staff/gate");
  await page.getByLabel("Passphrase").fill(localGatePhrase);
  await page.getByRole("button", { name: "Continue" }).click();

  // Admitted, and with no session the console sends us to its own sign-in.
  await expect(page).toHaveURL(/\/staff\/sign-in$/);
  await expect(
    page.getByRole("heading", { name: "Coach and staff sign in" }),
  ).toBeVisible();

  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByText(/remember/i)).toHaveCount(0);
  // A player who reaches the wrong door is given the right one.
  await expect(page.getByRole("link", { name: "Player sign in" })).toHaveCount(
    1,
  );

  // Nothing here overflows the narrowest phone.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow).toBe(false);
});

// REQ-107: a wrong password says one thing, whatever was wrong with it.
test("a failed staff sign-in reveals nothing about the account", async ({
  page,
}) => {
  await page.goto("/staff/gate");
  await page.getByLabel("Passphrase").fill(localGatePhrase);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/staff\/sign-in$/);

  await page.getByLabel("Email address").fill("nobody@example.test");
  await page.getByLabel("Password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("alert")).toContainText(
    "That did not work. Check the details and try again.",
  );
  // Still on the password step: no challenge was issued.
  await expect(page.getByLabel("Six-digit code")).toHaveCount(0);
});
