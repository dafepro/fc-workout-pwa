import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createAuthority } from "./authority.mjs";

test("relay retains grants privately, binds the room and rechecks revocation", async () => {
  let revoked = false,
    checks = 0;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(req.headers.authorization, "Bearer relay-secret");
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/internal/team-world/join") {
      assert.deepEqual(body, { ticket: "ticket", room: "team:one:world:v3" });
      res.end(
        JSON.stringify({
          identity: {
            id: "player",
            name: "Ari",
            appearance: "burgundy",
            private: "not-for-clients",
          },
          grant: "g".repeat(43),
        }),
      );
    } else {
      checks++;
      assert.equal(body.grant, "g".repeat(43));
      res.statusCode = revoked ? 403 : 200;
      res.end(JSON.stringify({ allowed: !revoked }));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const authority = createAuthority({
      baseURL: `http://127.0.0.1:${server.address().port}`,
      key: "relay-secret",
    });
    const identity = await authority.authenticate(
      "ticket",
      "team:one:world:v3",
    );
    assert.deepEqual(identity, {
      id: "player",
      name: "Ari",
      appearance: "burgundy",
    });
    assert.equal(
      await authority.canAccess({ ...identity }, "team:one:world:v3"),
      false,
    );
    assert.equal(
      await authority.canAccess(identity, "team:other:world:v3"),
      false,
    );
    assert.deepEqual(
      await Promise.all(
        Array.from({ length: 10 }, () =>
          authority.canAccess(identity, "team:one:world:v3"),
        ),
      ),
      Array(10).fill(true),
    );
    assert.equal(checks, 1);
    revoked = true;
    await new Promise((r) => setTimeout(r, 1050));
    assert.equal(
      await authority.canAccess(identity, "team:one:world:v3"),
      false,
    );
    assert.equal(
      await authority.canAccess(identity, "team:one:world:v3"),
      false,
    );
    assert.equal(checks, 2);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
