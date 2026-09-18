import * as THREE from "three";
import { expect, request, test, type Page } from "@playwright/test";
import type { Simulation } from "zmap";
import {
  loginAsMason as signInMason,
  loginAsAva as signInAva,
} from "./app-ready";

async function qualify(page: Page, login: (page: Page) => Promise<void>) {
  await login(page);
  await page.goto("/log/additional");
  await page
    .getByRole("button", { name: "Choose an activity", exact: true })
    .click();
  await page.getByRole("radio", { name: /^Hill Sprints/i }).click();
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes("/api/zoomigo/v1/me/training-entries") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^Save / }).click();
  expect((await saved).status()).toBe(201);
}
const loginAsMason = (page: Page) => qualify(page, signInMason);
const loginAsAva = (page: Page) => qualify(page, signInAva);

test("a real kick scores for both peers, then returns the ball to midfield", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const local = observe(page);
  const phases = new Set<string>();
  let sawKick = false;
  page.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => {
      const m = JSON.parse(String(payload));
      if (
        Object.values(m.state?.players ?? {}).some(
          (p) => ((p as { kick?: number }).kick ?? 0) > 0,
        )
      )
        sawKick = true;
      const phase = m.state?.objects?.instances?.["main-pitch"]?.phase;
      if (phase) phases.add(phase);
    }),
  );
  await loginAsMason(page);
  await page.goto("/team-world");
  await expect(page.getByText("Live together", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  const friend = await browser.newContext(),
    other = await friend.newPage(),
    peer = observe(other);
  try {
    await loginAsAva(other);
    await other.goto("/team-world");
    await expect(other.getByText("Live together", { exact: true })).toBeVisible(
      { timeout: 15000 },
    );
    await expect(page.getByText("2 players", { exact: true })).toBeVisible();
    await page
      .locator("summary")
      .filter({ hasText: /^Move & play$/ })
      .click();
    await page
      .getByRole("combobox", { name: "Movement mode" })
      .selectOption("path");
    await page.getByRole("slider", { name: "Camera zoom" }).focus();
    await page.keyboard.press("Home");
    await page
      .locator("summary")
      .filter({ hasText: /^Move & play$/ })
      .click();
    async function travel(x: number, z: number) {
      const rect = (await page
        .locator(".team-world-canvas canvas")
        .boundingBox())!;
      const body = local.state!.players[local.session!];
      const camera = new THREE.OrthographicCamera(
        (-10 * rect.width) / rect.height,
        (10 * rect.width) / rect.height,
        10,
        -10,
        0.1,
        200,
      );
      camera.position.set(body.x + 16, body.y + 19.8, body.z + 16);
      camera.lookAt(body.x, body.y + 0.8, body.z);
      camera.updateMatrixWorld();
      const point = new THREE.Vector3(x, 0, z).project(camera);
      await page.mouse.click(
        rect.x + ((point.x + 1) * rect.width) / 2,
        rect.y + ((1 - point.y) * rect.height) / 2,
      );
      await expect
        .poll(
          () => {
            const p = local.state?.players[local.session!];
            return p ? Math.hypot(p.x - x, p.z - z) : 100;
          },
          { timeout: 25000 },
        )
        .toBeLessThan(0.15);
      await expect(page.locator(".team-world-hint")).toContainText(
        "You’re here",
      );
      await page.waitForTimeout(600);
    }
    // Approach from the left without dribbling the ball out of position en route.
    await travel(-12, 8);
    await travel(-9.2, 13);
    await page.getByRole("button", { name: "Kick ball", exact: true }).click();
    await expect
      .poll(
        () =>
          (
            peer.state?.objects?.instances["main-pitch"] as
              | { burgundy: number }
              | undefined
          )?.burgundy,
        { timeout: 15000 },
      )
      .toBe(1);
    await expect(
      page.getByRole("status", { name: "Pitch score" }),
    ).toContainText("Burgundy 1");
    await expect(
      other.getByRole("status", { name: "Pitch score" }),
    ).toContainText("Burgundy 1");
    await expect
      .poll(
        () => {
          const b = peer.state?.toys["practice-ball"];
          return b ? Math.hypot(b.x + 8, b.z - 13) : 100;
        },
        { timeout: 8000 },
      )
      .toBeLessThan(0.05);
    expect(sawKick).toBe(true);
    expect(phases.has("goal")).toBe(true);
    expect(phases.has("return")).toBe(true);
    expect(local.errors).toEqual([]);
    expect(peer.errors).toEqual([]);
  } catch (error) {
    console.log(
      "SOCCER_STATE",
      JSON.stringify({
        ball: local.state?.toys["practice-ball"],
        pitch: local.state?.objects?.instances["main-pitch"],
        player: local.state?.players[local.session!],
        peerBall: peer.state?.toys["practice-ball"],
      }),
    );
    throw error;
  } finally {
    await friend.close();
  }
});

const apiURL = process.env.E2E_API_BASE_URL ?? "http://api:8080";
const resetKey = process.env.E2E_RESET_KEY ?? "local-e2e-reset-only";
// The default suite has no v3 relay. Enable only for the documented local topology.
test.skip(
  process.env.E2E_TEAM_WORLD !== "1",
  "Requires the local Team World relay and API configuration",
);
test.beforeEach(async () => {
  const api = await request.newContext({ baseURL: apiURL });
  const reset = await api.post("/__e2e/reset", {
    headers: { "X-E2E-Reset-Key": resetKey },
  });
  expect(reset.status()).toBe(204);
  await api.dispose();
});
function observe(page: Page) {
  const data: { session?: string; state?: Simulation; errors: string[] } = {
    errors: [],
  };
  page.on("pageerror", (error) => data.errors.push(error.message));
  page.on("websocket", (socket) => {
    if (new URL(socket.url()).pathname !== "/room") return;
    socket.on("framereceived", ({ payload }) => {
      const m = JSON.parse(String(payload));
      if (m.type === "welcome") data.session = m.session;
      if (m.type === "room" || m.type === "snapshot") data.state = m.state;
    });
  });
  return data;
}
test("two real accounts share movement, tools and emotes; route exit releases the world", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const a = observe(page);
  await loginAsMason(page);
  await page.goto("/team-world");
  await expect(page.getByText("Live together", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  const friend = await browser.newContext();
  const b = await friend.newPage();
  const peer = observe(b);
  try {
    await loginAsAva(b);
    await b.goto("/team-world");
    await expect(b.getByText("Live together", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("2 players", { exact: true })).toBeVisible();
    await expect
      .poll(() => peer.state?.players[a.session!]?.x)
      .not.toBeUndefined();
    const start = peer.state!.players[a.session!];
    await page.locator(".team-world-canvas canvas").focus();
    await page.keyboard.down("d");
    await expect
      .poll(() =>
        Math.hypot(
          (peer.state?.players[a.session!]?.x ?? start.x) - start.x,
          (peer.state?.players[a.session!]?.z ?? start.z) - start.z,
        ),
      )
      .toBeGreaterThan(0.3);
    await page.keyboard.up("d");
    await page
      .locator("summary")
      .filter({ hasText: /^Equipment$/ })
      .click();
    await page
      .getByRole("combobox", { name: "Equipment", exact: true })
      .selectOption("rebound-panel");
    await expect
      .poll(() => peer.state?.actions?.players[a.session!]?.tool)
      .toBe("rebound-panel");
    await page
      .locator("summary")
      .filter({ hasText: /^Expression$/ })
      .click();
    await page
      .getByRole("combobox", { name: "Expression", exact: true })
      .selectOption("wave");
    await expect
      .poll(
        () => peer.state?.actions?.players[a.session!]?.performance?.emote?.id,
      )
      .toBe("wave");
    await page.setViewportSize({ width: 320, height: 720 });
    await expect(page.locator(".team-world-hint")).toBeHidden();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .locator("summary")
      .filter({ hasText: /^Move & play$/ })
      .click();
    await page
      .getByRole("combobox", { name: "Movement mode", exact: true })
      .selectOption("joystick");
    await expect(page.locator(".team-world-stick")).toBeHidden();
    await page.getByRole("link", { name: "Back to Team", exact: true }).click();
    await expect(page.locator(".team-world-canvas canvas")).toHaveCount(0);
    await expect(b.getByText("1 player", { exact: true })).toBeVisible({
      timeout: 5000,
    });
    expect(a.errors).toEqual([]);
    expect(peer.errors).toEqual([]);
  } finally {
    await friend.close();
  }
});

test("a revoked real session loses room access", async ({ page }) => {
  await loginAsMason(page);
  await page.goto("/team-world");
  await expect(page.getByText("Live together", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  const response = await page.request.delete("/api/auth/session", {
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(response.ok()).toBe(true);
  await expect(
    page.getByRole("heading", {
      name: "This room is unavailable",
      exact: true,
    }),
  ).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".team-world-connection")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Kick ball", exact: true }),
  ).toBeDisabled();
});

test("fullscreen overlays resize the world and remain usable at phone widths", async ({
  page,
}) => {
  await loginAsMason(page);
  await page.goto("/team-world");
  await expect(page.getByText("Live together", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  const world = page.getByRole("region", { name: "Team World", exact: true });
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  await expect(world).toHaveClass(/team-world--fullscreen/);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const r = document
          .querySelector(".team-world-canvas")!
          .getBoundingClientRect();
        return (
          Math.abs(r.height - innerHeight) < 2 &&
          Math.abs(r.width - innerWidth) < 2
        );
      }),
    )
    .toBe(true);
  await page
    .locator("summary")
    .filter({ hasText: /^Equipment$/ })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Equipment", exact: true }),
  ).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: /^Expression$/ })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Equipment", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("combobox", { name: "Expression", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Exit full screen", exact: true })
    .click();
  await expect(world).not.toHaveClass(/team-world--fullscreen/);
  for (const size of [
    { width: 320, height: 720 },
    { width: 740, height: 360 },
  ]) {
    await page.setViewportSize(size);
    await page
      .getByRole("button", { name: "Full screen", exact: true })
      .click();
    const controls = await page.locator(".team-world-dock").boundingBox();
    expect(controls!.x).toBeGreaterThanOrEqual(0);
    expect(controls!.x + controls!.width).toBeLessThanOrEqual(size.width);
    const kick = (await page
      .getByRole("button", { name: "Kick ball", exact: true })
      .boundingBox())!;
    const hint = (await page.locator(".team-world-hint").boundingBox())!;
    expect(kick.y + kick.height).toBeLessThanOrEqual(hint.y);
    await page
      .getByRole("button", { name: "Exit full screen", exact: true })
      .click();
  }
});

test("idle overlays avoid frame-by-frame DOM churn and fullscreen respects the raster budget", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await loginAsMason(page);
  await page.goto("/team-world");
  await expect(page.getByText("Live together", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  await page.waitForTimeout(500);
  const mutations = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let count = 0;
        const observer = new MutationObserver(
          (records) => (count += records.length),
        );
        observer.observe(document.querySelector(".team-world-dock")!, {
          subtree: true,
          attributes: true,
          childList: true,
          characterData: true,
        });
        setTimeout(() => {
          observer.disconnect();
          resolve(count);
        }, 1000);
      }),
  );
  expect(mutations).toBeLessThan(5);
  expect(
    await page
      .locator(".team-world-canvas")
      .evaluate((el) => el.clientWidth * el.clientHeight),
  ).toBeGreaterThan(1_500_000);
  const pixels = await page
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => canvas.width * canvas.height);
  expect(pixels).toBeLessThanOrEqual(1_500_001);
});

test("nearby item actions share lamp state with a teammate", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const a = observe(page);
  await loginAsMason(page);
  await page.goto("/team-world");
  await expect(page.getByText("Live together", { exact: true })).toBeVisible();
  const friend = await browser.newContext();
  const b = await friend.newPage();
  const peer = observe(b);
  try {
    await loginAsAva(b);
    await b.goto("/team-world");
    await expect(b.getByText("Live together", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Turn courtyard lamp on", exact: true })
      .click();
    await expect
      .poll(
        () =>
          (
            peer.state?.objects?.instances["courtyard-lamp"] as
              | { on: boolean }
              | undefined
          )?.on,
      )
      .toBe(true);
    await expect(
      b.getByRole("button", { name: "Turn courtyard lamp off", exact: true }),
    ).toBeVisible();
    await b
      .getByRole("button", { name: "Turn courtyard lamp off", exact: true })
      .click();
    await expect
      .poll(
        () =>
          (
            a.state?.objects?.instances["courtyard-lamp"] as
              | { on: boolean }
              | undefined
          )?.on,
      )
      .toBe(false);
    await page.locator(".team-world-canvas canvas").focus();
    await page.keyboard.down("a");
    await expect(
      page.getByRole("button", { name: "Turn courtyard lamp on", exact: true }),
    ).toBeHidden();
    await page.keyboard.up("a");
    expect(a.errors).toEqual([]);
    expect(peer.errors).toEqual([]);
  } finally {
    await friend.close();
  }
});

test("hold steering follows cursor and joystick automatically selects a continuous pace", async ({
  page,
}) => {
  const inputs: { x: number; z: number; sprint?: boolean }[] = [];
  page.on("websocket", (socket) =>
    socket.on("framesent", ({ payload }) => {
      const m = JSON.parse(String(payload));
      if (m.type === "input") inputs.push(m.input);
    }),
  );
  await loginAsMason(page);
  await page.goto("/team-world");
  await expect(page.getByText("Live together", { exact: true })).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: /^Move & play$/ })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Movement mode" }),
  ).toHaveValue("joystick");
  await page
    .getByRole("combobox", { name: "Movement mode" })
    .selectOption("path");
  await page
    .locator("summary")
    .filter({ hasText: /^Move & play$/ })
    .click();
  const canvas = page.locator(".team-world-canvas canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.65);
  await page.mouse.down();
  await expect
    .poll(() => inputs.some((i) => Math.hypot(i.x, i.z) > 0.2))
    .toBe(true);
  const beforeTurn = inputs.at(-1)!;
  inputs.length = 0;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.65);
  await expect
    .poll(() =>
      inputs.some((i) => i.x * beforeTurn.x + i.z * beforeTurn.z < -0.02),
    )
    .toBe(true);
  await page.mouse.up();
  await expect
    .poll(() => Math.hypot(inputs.at(-1)?.x ?? 1, inputs.at(-1)?.z ?? 1))
    .toBe(0);
  await page
    .locator("summary")
    .filter({ hasText: /^Move & play$/ })
    .click();
  await page
    .getByRole("combobox", { name: "Movement mode" })
    .selectOption("joystick");
  await page
    .locator("summary")
    .filter({ hasText: /^Move & play$/ })
    .click();
  const x = box.x + box.width * 0.35,
    y = box.y + box.height * 0.55;
  await page.mouse.move(x, y);
  await page.mouse.down();
  expect((await page.locator(".team-world-stick").boundingBox())!.width).toBe(
    160,
  );
  await page.mouse.move(x + 15, y);
  await expect
    .poll(() => Math.hypot(inputs.at(-1)?.x ?? 0, inputs.at(-1)?.z ?? 0))
    .toBeGreaterThan(0.1);
  expect(inputs.at(-1)?.sprint).not.toBe(true);
  await page.mouse.move(x + 82, y);
  await expect.poll(() => inputs.at(-1)?.sprint).toBe(true);
  await expect(page.locator(".team-world-stick")).toHaveAttribute(
    "data-sprinting",
    "true",
  );
  if (process.env.E2E_CAMPUS_REVIEW === "1")
    await page.screenshot({ path: test.info().outputPath("joystick-v2.png") });
  await page.mouse.up();
  await expect(page.locator(".team-world-stick")).toBeHidden();
  const secondX = box.x + box.width * 0.65;
  const secondY = box.y + box.height * 0.6;
  await page.mouse.move(secondX, secondY);
  await page.mouse.down();
  const relocated = (await page.locator(".team-world-stick").boundingBox())!;
  expect(Math.abs(relocated.x + relocated.width / 2 - secondX)).toBeLessThan(2);
  expect(Math.abs(relocated.y + relocated.height / 2 - secondY)).toBeLessThan(
    2,
  );
  await page.mouse.move(secondX + 82, secondY);
  await expect.poll(() => inputs.at(-1)?.sprint).toBe(true);
  await page.keyboard.down("w");
  await expect.poll(() => inputs.at(-1)?.sprint).not.toBe(true);
  await page.keyboard.up("w");
  await page.mouse.up();
  await expect
    .poll(() => Math.hypot(inputs.at(-1)?.x ?? 1, inputs.at(-1)?.z ?? 1))
    .toBe(0);
});

test("short ground taps beside an item walk while distant taps build to a sprint", async ({
  page,
}) => {
  const observed = observe(page);
  let speeds: number[] = [];
  page.on("websocket", (socket) =>
    socket.on("framesent", ({ payload }) => {
      const m = JSON.parse(String(payload));
      if (m.type === "input")
        speeds.push(
          Math.hypot(m.input.x, m.input.z) * (m.input.sprint ? 5.4 : 2.2),
        );
    }),
  );
  await loginAsMason(page);
  await page.goto("/team-world");
  await expect(page.getByText("Live together", { exact: true })).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: /^Move & play$/ })
    .click();
  await page
    .getByRole("combobox", { name: "Movement mode" })
    .selectOption("path");
  await page
    .locator("summary")
    .filter({ hasText: /^Move & play$/ })
    .click();
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  await expect
    .poll(() => observed.state?.players[observed.session!]?.x)
    .not.toBeUndefined();
  async function tap(distance: number) {
    const p = observed.state!.players[observed.session!],
      rect = (await page.locator(".team-world-canvas canvas").boundingBox())!;
    const camera = new THREE.OrthographicCamera(
      (-10 * rect.width) / rect.height,
      (10 * rect.width) / rect.height,
      10,
      -10,
      0.1,
      200,
    );
    camera.zoom = 2;
    camera.position.set(p.x + 16, p.y + 0.8 + 19, p.z + 16);
    camera.lookAt(p.x, p.y + 0.8, p.z);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const target = new THREE.Vector3(p.x - distance, p.y, p.z).project(camera);
    speeds = [];
    await page.mouse.click(
      rect.x + ((target.x + 1) * rect.width) / 2,
      rect.y + ((1 - target.y) * rect.height) / 2,
    );
  }
  await tap(1);
  await expect.poll(() => Math.max(0, ...speeds)).toBeGreaterThan(0.5);
  await expect
    .poll(() => page.locator(".team-world-hint").textContent())
    .toContain("You’re here");
  expect(Math.max(...speeds)).toBeLessThanOrEqual(2.21);
  // Let the following camera settle before projecting the next world-space point.
  await page.waitForTimeout(600);
  await tap(6);
  await expect.poll(() => Math.max(0, ...speeds)).toBeGreaterThan(3);
  await page.keyboard.press("Escape");
  expect(observed.errors).toEqual([]);
});

test("connection loss covers the field and a fresh connection restores play", async ({
  page,
}) => {
  test.setTimeout(60000);
  let disconnect: ((code?: number) => void) | undefined;
  await page.routeWebSocket(/\/room(?:\?|$)/, (socket) => {
    const server = socket.connectToServer();
    disconnect = (code = 1012) => {
      server.close();
      socket.close({ code, reason: "Local recovery test" });
    };
  });
  await loginAsMason(page);
  await page.goto("/team-world");
  await expect(page.getByText("Live together", { exact: true })).toBeVisible({
    timeout: 20000,
  });
  disconnect!();
  await expect(page.locator(".team-world-connection")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Kick ball", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("Live together", { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator(".team-world-connection")).toHaveCount(0);
  disconnect!(4400);
  await expect(page.locator(".team-world-connection")).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.screenshot({ path: "outputs/campus/disconnected-mobile.png" });
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(page.getByText("Live together", { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator(".team-world-connection")).toHaveCount(0);
});

test("connected sprint stays live through sustained movement and turns", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const context = await browser.newContext({
    recordVideo: {
      dir: "outputs/campus/sprint-video",
      size: { width: 1280, height: 720 },
    },
  });
  const host = await context.newPage();
  await loginAsMason(host);
  await host.goto("/team-world");
  await expect(host.getByText("Live together", { exact: true })).toBeVisible({
    timeout: 20000,
  });
  const page = await context.newPage();
  const transportTimers = new Set<ReturnType<typeof setTimeout>>();
  if (process.env.E2E_SPRINT_JITTER === "1") {
    await page.routeWebSocket(/\/room(?:\?|$)/, (socket) => {
      const server = socket.connectToServer();
      const delayed = (send: (message: string | Buffer) => void) => {
        let due = 0,
          count = 0;
        return (message: string | Buffer) => {
          due = Math.max(due + 1, Date.now() + 75 + ((count++ % 5) - 2) * 15);
          const timer = setTimeout(
            () => {
              transportTimers.delete(timer);
              send(message);
            },
            Math.max(0, due - Date.now()),
          );
          transportTimers.add(timer);
        };
      };
      socket.onMessage(delayed((message) => server.send(message)));
      server.onMessage(delayed((message) => socket.send(message)));
    });
  }
  const observed = observe(page);
  try {
    await loginAsAva(page);
    await page.goto("/team-world");
    await expect(page.getByText("Live together", { exact: true })).toBeVisible({
      timeout: 20000,
    });
    await page
      .locator(".team-world-canvas canvas")
      .click({ position: { x: 500, y: 350 } });
    const timing = await page.evaluate(async () => {
      const frames: number[] = [];
      let previous = performance.now();
      for (let i = 0; i < 90; i++)
        await new Promise<void>((resolve) =>
          requestAnimationFrame((now) => {
            frames.push(now - previous);
            previous = now;
            resolve();
          }),
        );
      const gl = document
        .querySelector<HTMLCanvasElement>(".team-world-canvas canvas")!
        .getContext("webgl2")!;
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      frames.sort((a, b) => a - b);
      return {
        renderer: ext
          ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : "unknown",
        p50: frames[45],
        p95: frames[85],
        max: frames[89],
      };
    });
    console.log("SPRINT_RENDER", JSON.stringify(timing));
    await page.keyboard.down("Shift");
    for (const key of ["w", "d", "s", "a"]) {
      await page.keyboard.down(key);
      await page.waitForTimeout(1600);
      await expect(
        page.getByText("Live together", { exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: `outputs/campus/sprint-${key}.png` });
      await page.keyboard.up(key);
    }
    await page.keyboard.up("Shift");
    expect(observed.errors).toEqual([]);
  } finally {
    for (const timer of transportTimers) clearTimeout(timer);
    await context.close();
  }
});

test("dev rendering controls switch live, preserve the room and export safe settings", async ({
  page,
}) => {
  const observed = observe(page);
  await loginAsMason(page);
  await page.goto("/team-world");
  await expect(page.getByText("Live together", { exact: true })).toBeVisible({
    timeout: 20000,
  });
  const session = observed.session;
  await page.getByText("Render diagnostics", { exact: true }).click();
  await page
    .getByRole("button", { name: "Minimal rendering", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Avatar rendering", exact: true }),
  ).toHaveValue("capsule");
  await expect(
    page.getByRole("checkbox", { name: "Occlusion silhouette", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Copy diagnostic report", exact: true })
    .click();
  const report = JSON.parse(
    await page
      .getByRole("textbox", { name: "Diagnostic report", exact: true })
      .inputValue(),
  );
  expect(report.settings.avatar).toBe("capsule");
  expect(report.settings.silhouette).toBe(false);
  expect(report.graphics.width).toBeGreaterThan(0);
  expect(report.position.x).toEqual(expect.any(Number));
  expect(JSON.stringify(report)).not.toMatch(/credential|ticket|session/i);
  await page.screenshot({ path: "outputs/campus/debug-minimal.png" });
  await page
    .getByRole("button", { name: "Normal rendering", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Occlusion silhouette", exact: true }),
  ).toBeChecked();
  for (const name of [
    "Occlusion silhouette",
    "Avatar ink outlines",
    "Comic avatar shading",
    "Avatar animation",
    "Campus art",
    "Freeze camera",
  ]) {
    const control = page.getByRole("checkbox", { name, exact: true });
    await control.setChecked(!(await control.isChecked()));
    await page.waitForTimeout(500);
    await expect(
      page.getByText("Live together", { exact: true }),
      name,
    ).toBeVisible();
  }
  await page
    .getByRole("combobox", { name: "Scene materials", exact: true })
    .selectOption("wireframe");
  await page.waitForTimeout(700);
  await expect(page.getByText("Live together", { exact: true })).toBeVisible();
  await page.screenshot({ path: "outputs/campus/debug-wireframe.png" });
  expect(observed.session).toBe(session);
  await page.reload();
  await expect(page.getByText("Live together", { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await page.getByText("Render diagnostics", { exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Scene materials", exact: true }),
  ).toHaveValue("wireframe");
  await page
    .getByRole("button", { name: "Normal rendering", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 740 });
  await page
    .getByRole("button", { name: "Copy diagnostic report", exact: true })
    .click();
  const bounds = await page.locator(".team-world-debug").boundingBox();
  const field = await page.locator(".team-world-debug").evaluate((el) => {
    const rect = el.parentElement!.getBoundingClientRect();
    return { bottom: rect.bottom, right: rect.right };
  });
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(field.right);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(field.bottom);
  await page
    .getByRole("textbox", { name: "Diagnostic report", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("textbox", { name: "Diagnostic report", exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: "outputs/campus/debug-mobile.png" });
  expect(observed.errors).toEqual([]);
});
