#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const apiBaseURL = requiredEnvironment("DEV_SMOKE_API_BASE_URL").replace(
  /\/+$/,
  "",
);
const gatewayToken = requiredEnvironment("DEV_API_GATEWAY_TOKEN");

const ready = await request("GET", "/readyz");
assert.equal(ready.status, "ready", "API did not report ready");
passed("ready API");

const access = await request("GET", "/__dev/access");
assert.ok(access.players?.length, "dev access did not provide a player");
assert.ok(access.pin, "dev access did not provide a player PIN");
assert.ok(
  access.adminEmail && access.adminPassword,
  "dev access did not provide staff credentials",
);

const staffSession = await request("POST", "/__dev/staff-session", {
  body: { email: access.adminEmail, password: access.adminPassword },
  expectedStatus: 201,
});
assert.ok(staffSession.token, "staff sign-in did not return a token");

const loginURL = new URL(access.players[0].loginUrl);
const credential = new URLSearchParams(loginURL.hash.slice(1)).get(
  "credential",
);
assert.ok(credential, "player login URL did not contain a credential");
const playerSession = await request("POST", "/v1/auth/sessions", {
  body: { credential, pin: access.pin, rememberDevice: false },
  expectedStatus: 201,
});
assert.equal(
  playerSession.role,
  "player",
  "player sign-in returned the wrong role",
);
assert.ok(playerSession.token, "player sign-in did not return a token");
assert.equal(
  playerSession.player?.teams?.length,
  1,
  "smoke player must have exactly one team",
);
const team = playerSession.player.teams[0];
assert.ok(
  team.id && team.timeZone,
  "player team did not include its ID and time zone",
);
passed("player and staff sign-in");

const templates = await request("GET", "/v1/staff/training-plan-templates", {
  bearer: staffSession.token,
});
assert.ok(
  templates.templates?.some(({ id }) => id === "speed-recovery-v1"),
  "reviewed training-plan template is unavailable",
);
const plan = await request(
  "POST",
  `/v1/staff/teams/${encodeURIComponent(team.id)}/training-plans`,
  {
    bearer: staffSession.token,
    body: {
      templateId: "speed-recovery-v1",
      startsOn: dateInZone(team.timeZone, -3),
    },
    expectedStatus: 201,
  },
);
assert.equal(plan.status, "published", "training plan was not published");
const rest = await request("POST", "/v1/me/planned-rest-check-ins", {
  bearer: playerSession.token,
  body: { teamId: team.id, planId: plan.id, dayIndex: 3 },
  expectedStatus: 201,
  idempotencyKey: smokeKey("rest"),
});
assert.equal(rest.planId, plan.id, "planned-rest check-in used the wrong plan");
passed("published plan and planned rest");

const prizeOverview = await request("GET", "/v1/me/prize-boxes", {
  bearer: playerSession.token,
});
assert.equal(
  prizeOverview.dailyState,
  "available",
  "daily Prize Box was not available after check-in",
);
const claimed = await request("POST", "/v1/me/prize-boxes/claim-daily", {
  bearer: playerSession.token,
  expectedStatus: 201,
  idempotencyKey: smokeKey("claim"),
});
assert.ok(claimed.box?.id, "Prize Box claim did not return a sealed box");
assert.equal(
  claimed.box.item,
  undefined,
  "sealed Prize Box exposed its item early",
);
const opened = await request(
  "POST",
  `/v1/me/prize-boxes/${encodeURIComponent(claimed.box.id)}/open`,
  {
    bearer: playerSession.token,
    expectedStatus: 201,
    idempotencyKey: smokeKey("open"),
  },
);
const prizeItem = opened.claim?.item;
assert.ok(
  prizeItem?.id && prizeItem.kind,
  "opened Prize Box did not grant an item",
);
const inventory = await request(
  "GET",
  `/v1/me/unlocks?kind=${encodeURIComponent(prizeItem.kind)}`,
  { bearer: playerSession.token },
);
assert.ok(
  inventory.items?.some(({ item }) => item.id === prizeItem.id),
  "granted Prize Box item was missing from inventory",
);
passed("claimed and opened Prize Box");

const definitions = await request("GET", "/v1/staff/team-reward-definitions", {
  bearer: staffSession.token,
});
assert.ok(
  definitions.definitions?.some(({ id }) => id === "team-celebration-v1"),
  "reviewed Team Reward definition is unavailable",
);
const reward = await request(
  "POST",
  `/v1/staff/teams/${encodeURIComponent(team.id)}/team-reward`,
  {
    bearer: staffSession.token,
    body: {
      definitionId: "team-celebration-v1",
      startsOn: dateInZone(team.timeZone, 0),
      endsOn: dateInZone(team.timeZone, 6),
      requiredDays: 1,
      minimumRosterPercent: 50,
    },
    expectedStatus: 201,
    idempotencyKey: smokeKey("reward"),
  },
);
assert.equal(
  reward.status,
  "active",
  "Team Reward was not published as active",
);
const playerReward = await request(
  "GET",
  `/v1/teams/${encodeURIComponent(team.id)}/team-reward`,
  { bearer: playerSession.token },
);
assert.equal(
  playerReward.id,
  reward.id,
  "player received the wrong Team Reward",
);
assert.ok(
  playerReward.progress,
  "player Team Reward omitted aggregate progress",
);
const playerProjection = JSON.stringify(playerReward);
for (const privateField of [
  "playerId",
  "firstName",
  "resultValue",
  "effortLevel",
  "exhaustionLevel",
]) {
  assert.ok(
    !playerProjection.includes(privateField),
    `player Team Reward exposed ${privateField}`,
  );
}
passed("published and projected Team Reward");

console.log("disposable dev smoke passed");

async function request(method, path, options = {}) {
  const headers = {
    Accept: "application/json",
    "X-Zoomigo-Dev-Gateway": gatewayToken,
  };
  if (options.bearer) headers.Authorization = `Bearer ${options.bearer}`;
  if (options.idempotencyKey)
    headers["Idempotency-Key"] = options.idempotencyKey;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${apiBaseURL}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(15_000),
  });
  const expectedStatus = options.expectedStatus ?? 200;
  if (response.status !== expectedStatus) {
    throw new Error(
      `${method} ${path} returned HTTP ${response.status}, want ${expectedStatus}`,
    );
  }
  return response.json();
}

function dateInZone(timeZone, dayOffset) {
  const instant = new Date(Date.now() + dayOffset * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(instant)
    .reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function smokeKey(purpose) {
  return `dev-smoke-${purpose}-${randomUUID()}`;
}

function passed(message) {
  console.log(`passed: ${message}`);
}
