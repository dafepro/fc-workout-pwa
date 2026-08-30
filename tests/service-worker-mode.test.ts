import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = await readFile(join(process.cwd(), "public", "sw.js"), "utf8");

describe("service worker host mode", () => {
  it("clears and unregisters itself on development hosts", async () => {
    const harness = serviceWorkerHarness("dev.zoomigo.example");
    runInNewContext(source, harness.context);

    await dispatch(harness.handlers.get("install"));
    await dispatch(harness.handlers.get("activate"));
    let intercepted = false;
    harness.handlers.get("fetch")?.({
      request: new Request("https://dev.zoomigo.example/team"),
      respondWith: () => {
        intercepted = true;
      },
      waitUntil: () => undefined,
    });

    expect([...new Set(harness.deleted)].sort()).toEqual([
      "legacy-shell",
      "zoomigo-shell-v5",
    ]);
    expect(harness.unregistered()).toBe(1);
    expect(harness.lifecycle()).toEqual(["claim", "unregister"]);
    expect(intercepted).toBe(false);
  });

  it("retains the production offline shell", async () => {
    const harness = serviceWorkerHarness("app.zoomigo.example");
    runInNewContext(source, harness.context);

    await dispatch(harness.handlers.get("install"));
    await dispatch(harness.handlers.get("activate"));
    let intercepted = false;
    harness.handlers.get("fetch")?.({
      request: new Request("https://app.zoomigo.example/team"),
      respondWith: () => {
        intercepted = true;
      },
      waitUntil: () => undefined,
    });

    expect(harness.opened()).toBe(1);
    expect(harness.deleted).toEqual(["legacy-shell"]);
    expect(harness.unregistered()).toBe(0);
    expect(intercepted).toBe(true);
  });
});

function serviceWorkerHarness(hostname: string) {
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const deleted: string[] = [];
  let opened = 0;
  let unregistered = 0;
  const lifecycle: string[] = [];
  const context = {
    URL,
    fetch: async () => new Response("ok"),
    Response,
    caches: {
      keys: async () => ["legacy-shell", "zoomigo-shell-v5"],
      delete: async (key: string) => {
        deleted.push(key);
        return true;
      },
      open: async () => {
        opened += 1;
        return {
          addAll: async () => undefined,
          put: async () => undefined,
        };
      },
      match: async () => undefined,
    },
    self: {
      location: {
        hostname,
        origin: `https://${hostname}`,
      },
      addEventListener: (
        kind: string,
        handler: (event: Record<string, unknown>) => void,
      ) => handlers.set(kind, handler),
      skipWaiting: () => undefined,
      clients: {
        claim: async () => {
          lifecycle.push("claim");
        },
      },
      registration: {
        unregister: async () => {
          lifecycle.push("unregister");
          unregistered += 1;
          return true;
        },
      },
    },
  };
  return {
    context,
    handlers,
    deleted,
    opened: () => opened,
    unregistered: () => unregistered,
    lifecycle: () => lifecycle,
  };
}

async function dispatch(handler?: (event: Record<string, unknown>) => void) {
  expect(handler).toBeTypeOf("function");
  let pending: Promise<unknown> = Promise.resolve();
  handler!({ waitUntil: (promise: Promise<unknown>) => (pending = promise) });
  await pending;
}
