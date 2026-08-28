import { expect, request, test, type Page } from "@playwright/test";
import { FIXTURE_TEAM_ID, signInAsCoach } from "./staff-sign-in";

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://api:8080";
const resetKey = process.env.E2E_RESET_KEY ?? "local-e2e-reset-only";

// REQ-402 is retired: there is no edge gate in front of the console any more,
// so what this suite exercises locally is now the whole of what production
// serves rather than the part behind an admitted request.

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

// REQ-403's acceptance criterion, which nothing met past the sign-in door until
// there was a coach fixture: the coach journey on the narrowest phone. One test
// rather than four, because the point is that these screens are one workflow --
// sign in, move between the three sections, provision a player and be unable to
// close the reveal without acknowledging it, assign a workout that is not hill
// sprints, and amend its window.
test("a coach works through the console at 320 pixels", async ({ page }) => {
  const api = await request.newContext({ baseURL: apiBaseURL });
  expect(
    (
      await api.post("/__e2e/reset", {
        headers: { "X-E2E-Reset-Key": resetKey },
      })
    ).status(),
  ).toBe(204);
  await api.dispose();

  await page.setViewportSize({ width: 320, height: 720 });
  await signInAsCoach(page);

  // REQ-511: the team's three jobs, each at its own address.
  await page.getByRole("link", { name: "Hill Striders" }).click();
  await expect(page).toHaveURL(new RegExp(`/staff/teams/${FIXTURE_TEAM_ID}$`));
  await expect(
    page.getByRole("navigation", { name: "Team sections" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Team Reward" }).click();
  await expect(page).toHaveURL(/\/rewards$/);
  await expect(
    page.getByRole("heading", { name: "Team Reward" }),
  ).toBeVisible();
  await expect(page.getByText("Team celebration")).toBeVisible();
  await expectNoOverflow(page);

  await page.getByRole("link", { name: "Progress" }).click();
  await expect(page).toHaveURL(/\/progress$/);
  // REQ-516: the review that did not exist, and REQ-508: never an assessment.
  await expect(
    page.getByText(/have reached 3 sessions this week/),
  ).toBeVisible();
  await expect(page.getByText(/assessment/i)).toHaveCount(0);
  await expectNoOverflow(page);

  await page.getByRole("link", { name: "Roster" }).click();
  await expect(page).toHaveURL(/\/roster$/);
  await expectNoOverflow(page);

  // REQ-509: the reveal is modal and cannot be closed without acknowledging it.
  await page.getByLabel("First name").fill("Bailey");
  await page.getByLabel("Last initial").fill("Q");
  await page
    .getByRole("button", { name: "Create player and reveal code" })
    .click();

  const reveal = page.getByRole("dialog");
  await expect(reveal.getByText("Print or photograph this now")).toBeVisible();
  const done = reveal.getByRole("button", { name: "I have saved this" });
  await expect(done).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(reveal).toBeVisible();
  await expectNoOverflow(page);

  await reveal.getByLabel("I have saved the QR code, PIN, and link").check();
  await done.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Bailey Q")).toBeVisible();

  // REQ-512 and REQ-510: every preset is assignable, in the athlete's picker.
  await page.getByRole("link", { name: "Training" }).click();
  const picker = page.getByRole("button", { name: /^Selected activity:/ });
  // Clicked until it opens: the console does not gate its controls on
  // hydration, so a click that lands before React has attached is swallowed
  // silently. `aria-expanded` is the picker's own answer about whether the tap
  // took, which is also what a screen reader is told.
  await expect(async () => {
    await picker.click();
    await expect(picker).toHaveAttribute("aria-expanded", "true", {
      timeout: 1_000,
    });
  }).toPass({ timeout: 10_000 });
  // The radio itself is `opacity: 0` under its card, so click what a thumb
  // would: the label.
  await page
    .locator(".activity-choice label", { hasText: "Distance Run (2 miles)" })
    .click();
  await page.locator("#assignment-starts-on").fill(isoDaysFromToday(1));
  await page.locator("#assignment-due-on").fill(isoDaysFromToday(7));
  await page.getByRole("button", { name: "Create assignment" }).click();
  await expect(page.getByText("Distance Run").first()).toBeVisible();
  await expectNoOverflow(page);

  // REQ-513: the window a coach typed wrong is amendable.
  await page.getByRole("button", { name: "Amend" }).first().click();
  // The amendment form's fields are keyed by assignment id, which is also what
  // keeps two open rows from sharing an id.
  await page.locator('input[id^="amend-due-"]').fill(isoDaysFromToday(9));
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByText(isoDaysFromToday(9), { exact: false }).first(),
  ).toBeVisible();
  await expectNoOverflow(page);
});

function isoDaysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow).toBe(false);
}
