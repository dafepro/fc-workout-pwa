import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const script = resolve(import.meta.dirname, "dev-deploy-smoke.mjs");

test("disposable dev smoke proves final player and staff flows", async (t) => {
  const requests = [];
  const server = createServer(async (request, response) => {
    const body = await readBody(request);
    requests.push({
      method: request.method,
      path: request.url,
      gateway: request.headers["x-zoomigo-dev-gateway"],
      authorization: request.headers.authorization,
      idempotencyKey: request.headers["idempotency-key"],
      body,
    });

    const route = `${request.method} ${request.url}`;
    const fixtures = {
      "GET /readyz": [200, { status: "ready" }],
      "GET /__dev/access": [
        200,
        {
          players: [
            {
              name: "Mason C.",
              loginUrl:
                "https://example.invalid/login#credential=player-secret",
            },
          ],
          pin: "1111",
          adminEmail: "admin@dev.invalid",
          adminPassword: "staff-secret",
        },
      ],
      "POST /__dev/staff-session": [201, { token: "staff-token" }],
      "POST /v1/auth/sessions": [
        201,
        {
          token: "player-token",
          role: "player",
          player: {
            id: "player-mason",
            teams: [
              {
                id: "team-hill-striders",
                name: "Hill Striders",
                timeZone: "America/Chicago",
              },
            ],
          },
        },
      ],
      "GET /v1/staff/training-plan-templates": [
        200,
        { templates: [{ id: "speed-recovery-v1" }] },
      ],
      "POST /v1/staff/teams/team-hill-striders/training-plans": [
        201,
        {
          id: "plan-one",
          templateId: "speed-recovery-v1",
          status: "published",
        },
      ],
      "POST /v1/me/planned-rest-check-ins": [
        201,
        { id: "rest-one", planId: "plan-one", dayIndex: 3 },
      ],
      "GET /v1/me/prize-boxes": [200, { dailyState: "available" }],
      "POST /v1/me/prize-boxes/claim-daily": [
        201,
        { box: { id: "box-one", source: "daily_check_in" } },
      ],
      "POST /v1/me/prize-boxes/box-one/open": [
        201,
        {
          claim: {
            id: "box-one",
            item: { id: "sunset-stamp", kind: "lounge_stamp" },
          },
        },
      ],
      "GET /v1/me/unlocks?kind=lounge_stamp": [
        200,
        { items: [{ item: { id: "sunset-stamp", kind: "lounge_stamp" } }] },
      ],
      "GET /v1/staff/team-reward-definitions": [
        200,
        { definitions: [{ id: "team-celebration-v1" }] },
      ],
      "POST /v1/staff/teams/team-hill-striders/team-reward": [
        201,
        {
          id: "reward-one",
          teamId: "team-hill-striders",
          definitionId: "team-celebration-v1",
          status: "active",
        },
      ],
      "GET /v1/teams/team-hill-striders/team-reward": [
        200,
        {
          id: "reward-one",
          teamId: "team-hill-striders",
          title: "Team celebration",
          progress: { current: 0, target: 1, percent: 0, achieved: false },
        },
      ],
    };
    const fixture = fixtures[route];
    if (!fixture) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: route }));
      return;
    }
    response.writeHead(fixture[0], { "content-type": "application/json" });
    response.end(JSON.stringify(fixture[1]));
  });
  await new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen),
  );
  t.after(() => server.close());

  const address = server.address();
  const { stdout } = await execFileAsync(process.execPath, [script], {
    env: {
      ...process.env,
      DEV_SMOKE_API_BASE_URL: `http://127.0.0.1:${address.port}`,
      DEV_API_GATEWAY_TOKEN: "gateway-secret",
    },
  });

  assert.match(stdout, /ready API/);
  assert.match(stdout, /player and staff sign-in/);
  assert.match(stdout, /published plan and planned rest/);
  assert.match(stdout, /claimed and opened Prize Box/);
  assert.match(stdout, /published and projected Team Reward/);
  assert.match(stdout, /disposable dev smoke passed/);
  assert.equal(requests.length, 14);
  assert.ok(requests.every((request) => request.gateway === "gateway-secret"));

  const staffRequest = requests.find(
    ({ path }) => path === "/__dev/staff-session",
  );
  assert.deepEqual(JSON.parse(staffRequest.body), {
    email: "admin@dev.invalid",
    password: "staff-secret",
  });
  const playerRequest = requests.find(
    ({ path }) => path === "/v1/auth/sessions",
  );
  assert.deepEqual(JSON.parse(playerRequest.body), {
    credential: "player-secret",
    pin: "1111",
    rememberDevice: false,
  });
  const restRequest = requests.find(
    ({ path }) => path === "/v1/me/planned-rest-check-ins",
  );
  assert.equal(restRequest.authorization, "Bearer player-token");
  assert.equal(JSON.parse(restRequest.body).dayIndex, 3);
  assert.ok(restRequest.idempotencyKey);
  const rewardRequest = requests.find(({ path }) =>
    path.endsWith("/team-reward"),
  );
  assert.equal(rewardRequest.authorization, "Bearer staff-token");
  assert.ok(rewardRequest.idempotencyKey);
});

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

test("new infrastructure runs the deploy smoke after fixture seeding", async () => {
  const workflow = await readFile(
    resolve(import.meta.dirname, "../.github/workflows/dev.yml"),
    "utf8",
  );
  const smoke = workflow.indexOf("node scripts/dev-deploy-smoke.mjs");
  assert.ok(smoke > workflow.indexOf("name: Reset preview fixtures"));
  const smokeStep = workflow.slice(
    workflow.lastIndexOf("- name:", smoke),
    smoke,
  );
  assert.match(smokeStep, /inputs\.operation == 'create'/);
  assert.match(smokeStep, /steps\.infra\.outputs\.created == 'true'/);
  assert.doesNotMatch(smokeStep, /inputs\.operation == 'reset'/);
  assert.match(workflow.slice(smoke - 400, smoke), /DEV_SMOKE_API_BASE_URL/);
  assert.match(workflow.slice(smoke - 400, smoke), /DEV_API_GATEWAY_TOKEN/);
});
