import { performance } from "node:perf_hooks";
import {
  expect,
  request,
  test,
  type Page,
  type Response,
} from "@playwright/test";
import {
  COACH_PASSWORD,
  currentCoachCode,
  signInAsCoach,
} from "./staff-sign-in";

test.skip(
  process.env.E2E_STAFF_FRESHNESS !== "true",
  "Opt-in: this regression waits for the real five-minute server freshness window.",
);

// Auth requests contain credentials, so retain only screenshots of empty inputs.
test.use({ trace: "off", video: "off" });

test("a stale coach completes two-stage reauthentication and retries only the held action", async ({
  page,
}, testInfo) => {
  test.setTimeout(7 * 60_000);
  const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://api:8080";
  const pwaBaseURL = process.env.E2E_PWA_BASE_URL ?? "http://pwa:3000";
  const localHosts = new Set(["api", "pwa", "localhost", "127.0.0.1", "[::1]"]);
  for (const baseURL of [apiBaseURL, pwaBaseURL]) {
    expect(
      localHosts.has(new URL(baseURL).hostname),
      "Use disposable local Docker fixtures only",
    ).toBe(true);
  }
  const api = await request.newContext({ baseURL: apiBaseURL });
  try {
    expect(
      (
        await api.post("/__e2e/reset", {
          headers: {
            "X-E2E-Reset-Key":
              process.env.E2E_RESET_KEY ?? "local-e2e-reset-only",
          },
        })
      ).status(),
    ).toBe(204);

    const playerCredential = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    for (let attempt = 1; attempt <= 5; attempt++) {
      const failed = await api.post("/v1/auth/sessions", {
        data: { credential: playerCredential, pin: "1111" },
      });
      expect(failed.status()).toBe(attempt === 5 ? 429 : 401);
    }

    await page.setViewportSize({ width: 320, height: 720 });
    await signInAsCoach(page);
    await expect(
      page.getByRole("link", { name: "Hill Striders" }),
    ).toBeVisible();
    const signedInAt = performance.now();
    await page.goto("/staff/players/player-mason");
    await expect(
      page.getByRole("button", { name: "Unlock", exact: true }),
    ).toBeEnabled();
    await expect(page.getByText("Login locked", { exact: true })).toBeVisible();
    await assertMobile(page);

    // Exercise the deployed server clock, never an aging endpoint or a database edit.
    while (performance.now() - signedInAt <= 302_000) {
      const remaining = 302_001 - (performance.now() - signedInAt);
      console.log(
        `Waiting for real staff freshness expiry: ${Math.ceil(remaining / 1000)}s remaining`,
      );
      await page.waitForTimeout(Math.min(55_000, remaining));
    }

    const credentialPath = "/v1/staff/players/player-mason/credential";
    const isCredential = (response: Response) =>
      new URL(response.url()).pathname.endsWith(credentialPath) &&
      response.request().method() === "POST";
    const attempts: Response[] = [];
    page.on("response", (response) => {
      if (isCredential(response)) attempts.push(response);
    });
    const refused = page.waitForResponse(isCredential);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    const stale = await refused;
    expect(stale.status()).toBe(401);
    expect((await stale.json()).error.code).toBe("step_up_required");
    await expect(
      page.getByRole("heading", { name: "Confirm it is you" }),
    ).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Six-digit code")).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("staff-step-up-password-320.png"),
      fullPage: true,
    });
    await assertMobile(page);

    const stepUpPath = "/staff/api/step-up";
    const isStepUp = (response: Response) =>
      new URL(response.url()).pathname === stepUpPath &&
      response.request().method() === "POST";
    await page
      .getByLabel("Password", { exact: true })
      .fill("not-the-coach-password");
    const wrongPassword = page.waitForResponse(isStepUp);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    expect((await wrongPassword).status()).toBe(401);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByLabel("Six-digit code")).toHaveCount(0);
    expect(attempts.map((response) => response.status())).toEqual([401]);
    await expect(page.getByText("Login locked", { exact: true })).toBeVisible();

    await page.getByLabel("Password", { exact: true }).fill(COACH_PASSWORD);
    const passwordAccepted = page.waitForResponse(isStepUp);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const challenge = await passwordAccepted;
    expect(challenge.status()).toBe(200);
    expect((await challenge.json()).challenge).toEqual(expect.any(String));
    await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Six-digit code")).toBeVisible();
    expect(attempts.map((response) => response.status())).toEqual([401]);
    await page.screenshot({
      path: testInfo.outputPath("staff-step-up-code-320.png"),
      fullPage: true,
    });
    await assertMobile(page);

    await page.getByLabel("Six-digit code").fill(currentCoachCode());
    const codeAccepted = page.waitForResponse(isStepUp);
    const retried = page.waitForResponse(isCredential);
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    expect((await codeAccepted).status()).toBe(204);
    expect((await retried).status()).toBe(204);
    await expect(
      page.getByRole("heading", { name: "Confirm it is you" }),
    ).toHaveCount(0);
    await expect(page.getByText("Login active", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Unlock", exact: true }),
    ).toBeDisabled();
    await assertMobile(page);
    await page.reload();
    await expect(page.getByText("Login active", { exact: true })).toBeVisible();
    expect(attempts.map((response) => response.status())).toEqual([401, 204]);
    for (const response of attempts) {
      expect(response.request().postDataJSON()).toEqual({ action: "unlock" });
    }
    expect(
      (
        await api.post("/v1/auth/sessions", {
          data: { credential: playerCredential, pin: "2468" },
        })
      ).status(),
    ).toBe(201);
  } finally {
    await api.dispose();
  }
});

async function assertMobile(page: Page) {
  expect(
    await page.evaluate(() => ({
      width: innerWidth,
      content: document.documentElement.scrollWidth,
    })),
  ).toEqual({ width: 320, content: 320 });
}
