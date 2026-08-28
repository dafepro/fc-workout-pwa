import { expect, request, test } from "@playwright/test";

interface DevAccess {
  players: { name: string; loginUrl: string }[];
  pin: string;
}

test("a player with today's recorded training sees their own Lounge avatar", async ({
  page,
}) => {
  test.skip(
    process.env.DEV_LOUNGE_RELEASE_GATE !== "true",
    "the deployed-dev release gate is opt-in",
  );

  const apiBaseURL = requiredEnvironment("DEV_SMOKE_API_BASE_URL");
  const gatewayToken = requiredEnvironment("DEV_API_GATEWAY_TOKEN");
  const previewPassword = requiredEnvironment("DEV_ACCESS_PASSWORD");
  const api = await request.newContext({
    baseURL: apiBaseURL,
    extraHTTPHeaders: { "X-Zoomigo-Dev-Gateway": gatewayToken },
  });
  const accessResponse = await api.get("/__dev/access");
  expect(accessResponse.ok()).toBe(true);
  const access = (await accessResponse.json()) as DevAccess;
  await api.dispose();

  const player = access.players.find(({ name }) => name.startsWith("Mason"));
  expect(player, "the release fixture must include Mason").toBeTruthy();
  await page.goto(player!.loginUrl);
  await page.getByLabel("Password").fill(previewPassword);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Four-digit PIN").fill(access.pin);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.locator("html[data-app-ready='true']").waitFor();
  await expect(
    page.getByText("Done for today!", { exact: true }),
  ).toBeVisible();

  await page.goto("/team");
  await page.locator("html[data-app-ready='true']").waitFor();
  const lounge = page.getByRole("region", {
    name: "Beach Boardwalk Team Lounge",
  });
  const stage = lounge.getByLabel("Interactive lounge canvas");
  const ownAvatar = lounge
    .locator(".team-lounge__shared-avatar")
    .filter({ hasText: "You" })
    .locator(".avatar");
  await expect(stage.locator("canvas")).toBeVisible({ timeout: 15_000 });
  await expect(ownAvatar).toBeVisible({ timeout: 15_000 });
  await expect(lounge.getByText("The boardwalk could not open.")).toHaveCount(
    0,
  );

  await page.setViewportSize({ width: 320, height: 800 });
  await expect(ownAvatar).toBeVisible();
  const geometry = await lounge.evaluate((region) => {
    const stageElement = region.querySelector(".team-lounge__stage");
    const avatarElement = region.querySelector(
      ".team-lounge__shared-avatar .avatar",
    );
    const dockElement = region.querySelector(".team-lounge__actions");
    if (!stageElement || !avatarElement || !dockElement) return null;
    const stageBox = stageElement.getBoundingClientRect();
    const avatarBox = avatarElement.getBoundingClientRect();
    const dockBox = dockElement.getBoundingClientRect();
    return {
      stageAboveDock: stageBox.bottom <= dockBox.top + 1,
      avatarInsideStage:
        avatarBox.left >= stageBox.left &&
        avatarBox.right <= stageBox.right &&
        avatarBox.top >= stageBox.top &&
        avatarBox.bottom <= stageBox.bottom,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  expect(geometry).toEqual({
    stageAboveDock: true,
    avatarInsideStage: true,
    documentWidth: 320,
  });
});

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
