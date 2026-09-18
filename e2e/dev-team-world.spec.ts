import { expect, test, type Page } from "@playwright/test";
import type { Simulation } from "zmap";

test("dev keeps the outer gate and supports two qualified Team World players", async ({
  page,
  browser,
}) => {
  test.skip(
    process.env.DEV_WORLD_RELEASE_GATE !== "true",
    "Explicit deployed-dev verification only",
  );
  test.setTimeout(120000);
  expect(
    Boolean(
      process.env.DEV_ACCESS_PASSWORD &&
        process.env.DEV_ACCESS_PASSWORD.length >= 12,
    ),
  ).toBe(true);
  let stage = "directory";
  // Credential-directory contents must never be recorded in traces or screenshots.
  const friend = await browser.newContext({
    baseURL: process.env.E2E_PWA_BASE_URL,
  });
  const other = await friend.newPage();
  const diagnostics = [observeWorld(page), observeWorld(other)];
  await Promise.all([page, other].map(prepareFrameProbe));
  const profiles: (() => Promise<unknown>)[] = [];
  const entries: { page: Page; id: string }[] = [];
  const state: { session?: string; simulation?: Simulation } = {};
  const peer: { simulation?: Simulation } = {};
  let peerSawKick = false;
  page.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => {
      const m = JSON.parse(String(payload));
      if (m.type === "welcome") state.session = m.session;
      if (m.state) state.simulation = m.state;
    }),
  );
  other.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => {
      const m = JSON.parse(String(payload));
      if (m.state) {
        peer.simulation = m.state;
        if (state.session && (m.state.players[state.session]?.kick ?? 0) > 0)
          peerSawKick = true;
      }
    }),
  );
  try {
    for (const [p, name] of [
      [page, "Mason"],
      [other, "Ava"],
    ] as const) {
      await p.goto("/dev-access");
      await expect(p.getByLabel("Password", { exact: true })).toBeVisible();
      await p
        .getByLabel("Password", { exact: true })
        .fill(process.env.DEV_ACCESS_PASSWORD!);
      const gate = p.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/_dev-gate" &&
          r.request().method() === "POST",
      );
      await p.getByRole("button", { name: "Continue", exact: true }).click();
      expect(
        (await gate).status(),
        "The dev gate must accept its configured preview secret",
      ).toBe(303);
      const player = p
        .locator(".dev-player-list li")
        .filter({ has: p.getByRole("heading", { name: new RegExp(name) }) });
      stage = "player-sign-in";
      await player.getByRole("link").click();
      await p.locator("form[data-credential-ready='true']").waitFor();
      await p.getByLabel("Four-digit PIN").fill("1111");
      await p.getByRole("button", { name: "Sign in", exact: true }).click();
      stage = "qualification";
      await p.getByRole("link", { name: /Log another activity/i }).click();
      await p
        .getByRole("button", { name: "Choose an activity", exact: true })
        .click();
      await p.getByRole("radio", { name: /^Hill Sprints/i }).click();
      const saved = p.waitForResponse(
        (r) =>
          r.url().includes("/api/zoomigo/v1/me/training-entries") &&
          r.request().method() === "POST",
      );
      await p.getByRole("button", { name: /^Save / }).click();
      const response = await saved;
      expect(response.status()).toBe(201);
      entries.push({ page: p, id: (await response.json()).id });
      stage = "world-entry";
      await p.goto("/team-world");
      if (process.env.E2E_WORLD_PROFILE === "1")
        profiles.push(await startProfile(p));
      await expect(p.getByText("Live together", { exact: true })).toBeVisible({
        timeout: 30000,
      });
    }
    await expect(page.getByText("2 players", { exact: true })).toBeVisible();
    await expect
      .poll(() => peer.simulation?.players[state.session!]?.x)
      .not.toBeUndefined();
    stage = "render-diagnostics";
    await page.getByText("Render diagnostics", { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Save motion capture", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Copy diagnostic report", exact: true })
      .click();
    const capture = JSON.parse(
      await page
        .getByRole("textbox", { name: "Diagnostic report", exact: true })
        .inputValue(),
    );
    expect(capture.version).toBe(2);
    expect(capture.motion.frames.length).toBeGreaterThan(10);
    expect(capture.motion.columns).toContain("screenX");
    await page
      .getByRole("button", { name: "Minimal rendering", exact: true })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Avatar rendering", exact: true }),
    ).toHaveValue("capsule");
    await page
      .getByRole("button", { name: "Normal rendering", exact: true })
      .click();
    await page.getByText("Render diagnostics", { exact: true }).click();
    stage = "shared-kick";
    await page.getByRole("button", { name: "Kick ball", exact: true }).click();
    await expect.poll(() => peerSawKick).toBe(true);
    stage = "shared-lamp";
    const lamp = page.getByRole("button", {
      name: /^Turn courtyard lamp (on|off)$/,
    });
    const initialLabel = (await lamp.textContent())!;
    const changedLabel = initialLabel.endsWith("on")
      ? "Turn courtyard lamp off"
      : "Turn courtyard lamp on";
    await lamp.click();
    await expect(
      other.getByRole("button", { name: changedLabel, exact: true }),
    ).toBeVisible();
    await other
      .getByRole("button", { name: changedLabel, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: initialLabel, exact: true }),
    ).toBeVisible();
    stage = "movement-equipment";
    const start = peer.simulation!.players[state.session!];
    await page.locator(".team-world-canvas canvas").focus();
    await page.keyboard.down("d");
    await expect
      .poll(
        () =>
          Math.hypot(
            (peer.simulation?.players[state.session!]?.x ?? start.x) - start.x,
            (peer.simulation?.players[state.session!]?.z ?? start.z) - start.z,
          ),
        { timeout: 15000 },
      )
      .toBeGreaterThan(0.3);
    stage = "moving-kick";
    peerSawKick = false;
    const movingKickStart = { ...peer.simulation!.players[state.session!] };
    await page.getByRole("button", { name: "Kick ball", exact: true }).click();
    await expect.poll(() => peerSawKick).toBe(true);
    await expect(page.locator(".team-world-canvas canvas")).toBeFocused();
    await expect
      .poll(() =>
        Math.hypot(
          (peer.simulation?.players[state.session!]?.x ?? movingKickStart.x) -
            movingKickStart.x,
          (peer.simulation?.players[state.session!]?.z ?? movingKickStart.z) -
            movingKickStart.z,
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
      .poll(() => peer.simulation?.actions?.players[state.session!]?.tool)
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
        () =>
          peer.simulation?.actions?.players[state.session!]?.performance?.emote
            ?.id,
      )
      .toBe("wave");
    await page.goto("/team");
    await expect(other.getByText("1 player", { exact: true })).toBeVisible({
      timeout: 10000,
    });
  } catch (error) {
    console.log(
      "WORLD_DIAGNOSTICS",
      stage,
      JSON.stringify(await Promise.all(diagnostics.map((d) => d.snapshot()))),
    );
    if (profiles.length)
      console.log(
        "WORLD_CPU_PROFILE",
        JSON.stringify(await Promise.all(profiles.map((stop) => stop()))),
      );
    throw error;
  } finally {
    await page.keyboard.up("d").catch(() => undefined);
    for (const { page: p, id } of entries) {
      const removed = await p.request.delete(
        `/api/zoomigo/v1/training-entries/${encodeURIComponent(id)}`,
        { headers: { Origin: new URL(p.url()).origin } },
      );
      expect(removed.status()).toBe(204);
    }
    await friend.close();
  }
});
// These runs visit live dev credentials; retain no authentication artifacts.
test.use({
  trace: "off",
  screenshot: "off",
  video: "off",
  actionTimeout: 15000,
  navigationTimeout: 30000,
});

function observeWorld(page: Page) {
  const counts: Record<string, number> = {};
  const count = (key: string) => {
    counts[key] = (counts[key] ?? 0) + 1;
  };
  let host: boolean | undefined;
  let epoch: number | undefined;
  let tick: number | undefined;
  let eligible: boolean | undefined;
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    if (
      [
        "/_dev-gate",
        "/dev-access",
        "/api/auth/session",
        "/team-world",
      ].includes(path)
    )
      count(`${path}:${r.status()}`);
    if (path.endsWith("/world/ticket")) count(`ticket:${r.status()}`);
    if (path.startsWith("/team-world-assets/")) count(`asset:${r.status()}`);
  });
  page.on("pageerror", () => count("pageError"));
  page.on("console", (message) => {
    if (/WebGL|GPU|ReadPixels|context lost/i.test(message.text()))
      count("graphics:" + message.type());
  });
  page.on("websocket", (socket) => {
    if (new URL(socket.url()).pathname !== "/room") return;
    count("socketOpen");
    socket.on("close", () => count("socketClose"));
    socket.on("socketerror", () => count("socketError"));
    socket.on("framesent", ({ payload }) => {
      const m = JSON.parse(String(payload));
      if (m.type === "heartbeat") {
        count("heartbeat:" + m.eligible);
        eligible = m.eligible;
      }
    });
    socket.on("framereceived", ({ payload }) => {
      const m = JSON.parse(String(payload));
      if (["welcome", "room", "snapshot", "error", "denied"].includes(m.type))
        count(m.type);
      if (m.type === "room") {
        host = !!m.host;
        epoch = m.epoch;
      }
      if (m.state) tick = m.state.tick;
    });
  });
  return {
    async snapshot() {
      return {
        counts,
        host,
        epoch,
        tick,
        eligible,
        browser: await page
          .evaluate(() => ({
            hidden: document.hidden,
            path: location.pathname,
            status: document.querySelector('.team-world-bar [role="status"]')
              ?.textContent,
            canvases: document.querySelectorAll(".team-world-canvas canvas")
              .length,
            viewport: [innerWidth, innerHeight],
            frames: (window as Window & { worldFrameProbe?: unknown })
              .worldFrameProbe,
            socketCloseCodes: (
              window as Window & { worldSocketCloseCodes?: number[] }
            ).worldSocketCloseCodes,
            graphics: (() => {
              const canvas = document.querySelector<HTMLCanvasElement>(
                ".team-world-canvas canvas",
              );
              const gl = canvas?.getContext("webgl2");
              const info = gl?.getExtension("WEBGL_debug_renderer_info");
              return {
                width: canvas?.width,
                height: canvas?.height,
                renderer:
                  info && gl?.getParameter(info.UNMASKED_RENDERER_WEBGL),
              };
            })(),
          }))
          .catch(() => null),
      };
    },
  };
}

async function prepareFrameProbe(page: Page) {
  await page.addInitScript(() => {
    if (location.pathname !== "/team-world") return;
    const closeCodes: number[] = [];
    (
      window as Window & { worldSocketCloseCodes?: number[] }
    ).worldSocketCloseCodes = closeCodes;
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        if (new URL(String(url), location.href).pathname === "/room")
          this.addEventListener("close", (event) =>
            closeCodes.push(event.code),
          );
      }
    };
    const probe = {
      count: 0,
      max: 0,
      over100: 0,
      over250: 0,
      longTasks: 0,
      longestTask: 0,
    };
    (window as Window & { worldFrameProbe?: unknown }).worldFrameProbe = probe;
    let previous = 0;
    const frame = (t: number) => {
      if (previous) {
        const elapsed = t - previous;
        probe.count++;
        probe.max = Math.max(probe.max, Math.round(elapsed));
        if (elapsed > 100) probe.over100++;
        if (elapsed > 250) probe.over250++;
      }
      previous = t;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        probe.longTasks++;
        probe.longestTask = Math.max(
          probe.longestTask,
          Math.round(entry.duration),
        );
      }
    }).observe({ type: "longtask", buffered: true });
  });
}
async function startProfile(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.start");
  return async () => {
    try {
      const { profile } = await cdp.send("Profiler.stop");
      const nodes = new Map(
        profile.nodes.map((n) => [n.id, n.callFrame.functionName]),
      );
      const time = new Map<string, number>();
      profile.samples?.forEach((id, i) => {
        const name = nodes.get(id) || "anonymous";
        time.set(name, (time.get(name) || 0) + (profile.timeDeltas?.[i] || 0));
      });
      return [...time]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([name, us]) => ({ name, ms: Math.round(us / 1000) }));
    } catch {
      return null;
    } finally {
      await cdp.detach().catch(() => undefined);
    }
  };
}
