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
      "GET /readyz": [200, { status: "ready", release: "0123456789abcdef" }],
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
      DEV_SMOKE_EXPECTED_RELEASE: "0123456789abcdef",
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

test("update smoke proves the exact container without mutating fixtures", async (t) => {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    const body =
      request.url === "/readyz"
        ? { status: "ready", release: "fedcba9876543210" }
        : {
            players: [{ name: "Mason C." }],
            pin: "1111",
            adminEmail: "admin@dev.invalid",
            adminPassword: "staff-secret",
          };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  });
  await new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen),
  );
  t.after(() => server.close());

  const address = server.address();
  const { stdout } = await execFileAsync(
    process.execPath,
    [script, "--read-only"],
    {
      env: {
        ...process.env,
        DEV_SMOKE_API_BASE_URL: `http://127.0.0.1:${address.port}`,
        DEV_API_GATEWAY_TOKEN: "gateway-secret",
        DEV_SMOKE_EXPECTED_RELEASE: "fedcba9876543210",
      },
    },
  );

  assert.match(stdout, /exact dev container is serving/);
  assert.deepEqual(requests, ["GET /readyz", "GET /__dev/access"]);
});

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

test("updates prove the exact container and new infrastructure proves final flows", async () => {
  const [
    workflowSource,
    deploy,
    retry,
    devVariables,
    devInfrastructure,
    devCloudInit,
  ] = await Promise.all([
    readFile(
      resolve(import.meta.dirname, "../.github/workflows/dev.yml"),
      "utf8",
    ),
    readFile(
      resolve(import.meta.dirname, "../deploy/release/deploy-dev.sh"),
      "utf8",
    ),
    readFile(
      resolve(import.meta.dirname, "../deploy/release/retry-command.sh"),
      "utf8",
    ),
    readFile(resolve(import.meta.dirname, "../infra/dev/variables.tf"), "utf8"),
    readFile(resolve(import.meta.dirname, "../infra/dev/main.tf"), "utf8"),
    readFile(
      resolve(import.meta.dirname, "../infra/dev/cloud-init.yaml.tftpl"),
      "utf8",
    ),
  ]);
  const workflow = workflowSource.replaceAll("\r\n", "\n");
  const readOnlySmoke = workflow.indexOf(
    "node scripts/dev-deploy-smoke.mjs --read-only",
  );
  assert.ok(readOnlySmoke > workflow.indexOf("name: Reset preview fixtures"));
  const readOnlyStep = workflow.slice(
    workflow.lastIndexOf("- name:", readOnlySmoke),
    readOnlySmoke,
  );
  assert.match(readOnlyStep, /inputs\.operation == 'create'/);
  assert.match(readOnlyStep, /inputs\.operation == 'update'/);
  assert.match(readOnlyStep, /DEV_SMOKE_EXPECTED_RELEASE/);

  const fullSmoke = workflow.indexOf(
    "run: node scripts/dev-deploy-smoke.mjs\n",
    readOnlySmoke,
  );
  const fullSmokeStep = workflow.slice(
    workflow.lastIndexOf("- name:", fullSmoke),
    fullSmoke,
  );
  assert.match(fullSmokeStep, /inputs\.operation == 'create'/);
  assert.match(fullSmokeStep, /steps\.infra\.outputs\.created == 'true'/);
  assert.doesNotMatch(fullSmokeStep, /inputs\.operation == 'update'/);
  assert.match(fullSmokeStep, /DEV_SMOKE_EXPECTED_RELEASE/);

  assert.match(workflow, /retry-command\.sh 3 10 tofu init/);
  assert.match(workflow, /retry-command\.sh 3 15 tofu apply/);
  assert.match(workflow, /pnpm verify:worker-upload/);
  assert.ok(
    workflow.indexOf("pnpm verify:worker-upload") <
      workflow.indexOf("actions\/upload-artifact@v4"),
  );
  assert.match(deploy, /ConnectTimeout=10/);
  assert.match(deploy, /ServerAliveInterval=15/);
  assert.match(deploy, /retry_command.*wrangler deploy/);
  assert.match(retry, /failed after \$attempt attempts/);
  assert.doesNotMatch(retry, /eval/);

  assert.match(devVariables, /variable "operator_ssh_public_key"/);
  assert.match(devVariables, /zoomigo-operator/);
  assert.match(devInfrastructure, /operator_ssh_public_key\s+=/);
  assert.match(devCloudInit, /\$\{operator_ssh_public_key\}/);
  assert.match(workflow, /vars\.DEV_OPERATOR_SSH_PUBLIC_KEY/);
  assert.doesNotMatch(workflow, /vars\.OPERATOR_SSH_PUBLIC_KEY/);
  assert.match(workflow, /TF_VAR_operator_ssh_public_key/);
  assert.match(workflow, /name: Authorize operator SSH key/);
  assert.match(workflow, / zoomigo-operator\$/);
  assert.match(workflow, /name: Publish dev operator access endpoint/);
  assert.match(workflow, /dev-operator-access-\$\{\{ github\.run_id \}\}/);
  assert.match(workflow, /retention-days: 1/);
});
