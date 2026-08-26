import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);

test("the static service worker clears and unregisters itself on dev hosts", async () => {
  const harness = serviceWorkerHarness("dev.zoomigo.example");
  const { handlers } = harness;
  runInNewContext(source, harness.context);

  await dispatch(handlers.get("install"));
  await dispatch(handlers.get("activate"));
  let intercepted = false;
  handlers.get("fetch")?.({
    request: new Request("https://dev.zoomigo.example/team"),
    respondWith: () => {
      intercepted = true;
    },
    waitUntil: () => undefined,
  });

  assert.deepEqual([...new Set(harness.deleted)].sort(), [
    "legacy-shell",
    "zoomigo-shell-v5",
  ]);
  assert.equal(harness.unregistered(), 1);
  assert.equal(intercepted, false);
});

test("the static service worker retains the production offline shell", async () => {
  const harness = serviceWorkerHarness("app.zoomigo.example");
  const { handlers } = harness;
  runInNewContext(source, harness.context);

  await dispatch(handlers.get("install"));
  await dispatch(handlers.get("activate"));
  let intercepted = false;
  handlers.get("fetch")?.({
    request: new Request("https://app.zoomigo.example/team"),
    respondWith: () => {
      intercepted = true;
    },
    waitUntil: () => undefined,
  });

  assert.equal(harness.opened(), 1);
  assert.deepEqual(harness.deleted, ["legacy-shell"]);
  assert.equal(harness.unregistered(), 0);
  assert.equal(intercepted, true);
});

function serviceWorkerHarness(hostname) {
  const handlers = new Map();
  const deleted = [];
  let opened = 0;
  let unregistered = 0;
  const context = {
    URL,
    fetch: async () => new Response("ok"),
    Response,
    caches: {
      keys: async () => ["legacy-shell", "zoomigo-shell-v5"],
      delete: async (key) => {
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
      addEventListener: (kind, handler) => handlers.set(kind, handler),
      skipWaiting: () => undefined,
      clients: { claim: async () => undefined },
      registration: {
        unregister: async () => {
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
  };
}

async function dispatch(handler) {
  assert.equal(typeof handler, "function");
  let pending = Promise.resolve();
  handler({ waitUntil: (promise) => (pending = promise) });
  await pending;
}
