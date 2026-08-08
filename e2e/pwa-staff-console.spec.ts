import { expect, test } from "@playwright/test";

// REQ-402 is no longer observable from here. The console's edge gate is
// Cloudflare Access, which runs in front of the deployed Worker and has no
// local equivalent, so this suite starts from an already-admitted request --
// exactly what a browser past Access sees. The gate itself is verified against
// production by checking that `/staff/*` redirects to the Access login.

// REQ-106 and REQ-403 for the surfaces phases 0-2 ship: the staff door names
// who it is for, asks for a password before a code, offers no remembered
// device, and works on the narrowest phone.
test("staff sign-in works at 320 pixels and offers no remembered device", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/staff/admin");

  // With no session the console sends us to its own sign-in.
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
  await page.goto("/staff/admin");
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
