import { test, expect } from "@playwright/test";
test("shooting leg carries momentum through contact", async ({ page }) => {
  test.skip(process.env.E2E_CAMPUS_REVIEW !== "1");
  await page.goto("http://127.0.0.1:3006/tools/team-world/motion-review.html");
  await expect(page.locator("#result")).toContainText("ready", {
    timeout: 30000,
  });
  const angles = await page.evaluate(async () => {
    const path = "/tools/team-world/motion-review.ts";
    const { kickFrame, measurements } = await import(path);
    for (let i = 0; i < 60; i++) kickFrame(60);
    return [11.94, 12, 12.06].map((frame) => {
      kickFrame(frame);
      return measurements("contact").rightThigh as number;
    });
  });
  const incoming = (angles[1] - angles[0]) / 0.001;
  const outgoing = (angles[2] - angles[1]) / 0.001;
  expect(incoming).toBeLessThan(-2);
  expect(outgoing).toBeLessThan(-2);
  expect(Math.abs(incoming - outgoing)).toBeLessThan(1);
});
test("sprint pose renders consistently across repeated passes", async ({
  page,
}) => {
  test.skip(process.env.E2E_CAMPUS_REVIEW !== "1");
  await page.goto("http://127.0.0.1:3006/tools/team-world/motion-review.html");
  await expect(page.locator("#result")).toContainText("ready", {
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Run sprint comparison" }).click();
  await expect(page.locator("#result")).toContainText("differences");
  const result = JSON.parse((await page.locator("#result").textContent())!);
  await page.screenshot({
    path: "outputs/campus/sprint-motion.png",
    fullPage: true,
  });
  expect(result.differences).toEqual([]);
});

for (const appearance of ["burgundy", "saffron", "sage", "burgundy&moving=1"])
  test(`kick drives the whole body and lands on the shooting foot: ${appearance}`, async ({
    page,
  }) => {
    test.skip(process.env.E2E_CAMPUS_REVIEW !== "1");
    await page.goto(
      `http://127.0.0.1:3006/tools/team-world/motion-review.html?appearance=${appearance}`,
    );
    await expect(page.locator("#result")).toContainText("ready", {
      timeout: 30000,
    });
    await page
      .getByRole("button", { name: "Review kick", exact: true })
      .click();
    await expect(page.locator("#result")).toContainText("kick complete");
    const { poses, baseline } = JSON.parse(
      (await page.locator("#result").textContent())!,
    );
    const plant = poses.find(
      (pose: { label: string }) => pose.label === "Plant",
    );
    const follow = poses.find(
      (pose: { label: string }) => pose.label === "Follow through",
    );
    const landing = poses.find(
      (pose: { label: string }) => pose.label === "Right-foot landing",
    );
    await page.screenshot({
      path: `outputs/campus/kick-motion-${appearance}.png`,
      fullPage: true,
    });
    expect(plant.leftSole).toBeCloseTo(0, 2);
    expect(plant.rightSole).toBeGreaterThan(0.12);
    expect(plant.rightThigh).toBeGreaterThan(0.85);
    expect(plant.chestLean).toBeLessThan(-0.05);
    expect(Math.abs(follow.chestYaw - plant.chestYaw)).toBeGreaterThan(0.15);
    expect(Math.abs(follow.leftArm - plant.leftArm)).toBeGreaterThan(0.2);
    expect(landing.rightSole).toBeCloseTo(0, 2);
    expect(landing.leftSole).toBeGreaterThan(0.12);
    expect(landing.rightKnee).toBeGreaterThan(0.25);
    const flight = poses.find(
      (pose: { label: string }) => pose.label === "Flight",
    );
    expect(Math.min(flight.leftSole, flight.rightSole)).toBeGreaterThan(0.1);
    const recovery = poses.find(
      (pose: { label: string }) => pose.label === "Recover",
    );
    if (!appearance.includes("moving")) {
      expect(recovery.chestYaw).toBeCloseTo(baseline.chestYaw, 3);
      expect(recovery.leftArm).toBeCloseTo(baseline.leftArm, 3);
      expect(recovery.leftSole).toBeCloseTo(baseline.leftSole, 2);
      expect(recovery.rightSole).toBeCloseTo(baseline.rightSole, 2);
    } else {
      expect(recovery.worldZ - plant.worldZ).toBeGreaterThan(4);
    }
    await page
      .getByRole("button", { name: "Review kick", exact: true })
      .click();
    const repeated = JSON.parse(
      (await page.locator("#result").textContent())!,
    ).poses;
    expect(
      repeated.find(
        (pose: { label: string }) => pose.label === "Right-foot landing",
      ).rightSole,
    ).toBeCloseTo(0, 2);
  });

test("reduced motion omits the shooting pose and recovery", async ({
  page,
}) => {
  test.skip(process.env.E2E_CAMPUS_REVIEW !== "1");
  await page.goto(
    "http://127.0.0.1:3006/tools/team-world/motion-review.html?reduced=1",
  );
  await expect(page.locator("#result")).toContainText("ready", {
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Review kick", exact: true }).click();
  const { baseline, poses } = JSON.parse(
    (await page.locator("#result").textContent())!,
  );
  for (const pose of poses) {
    for (const property of [
      "leftSole",
      "rightSole",
      "chestYaw",
      "leftArm",
      "rightKnee",
    ]) {
      expect(pose[property]).toBeCloseTo(baseline[property], 3);
    }
  }
});

for (const style of ["header", "bicycle"])
  test(`${style} has anticipation, contact, follow-through and a grounded recovery`, async ({
    page,
  }) => {
    test.skip(process.env.E2E_CAMPUS_REVIEW !== "1");
    await page.goto(
      `http://127.0.0.1:3006/tools/team-world/motion-review.html?strike=${style}`,
    );
    await expect(page.locator("#result")).toContainText("ready");
    const frames = await page.evaluate(async () => {
      const path = "/tools/team-world/motion-review.ts";
      const { kickFrame, measurements } = await import(path);
      for (let i = 0; i < 90; i++) kickFrame(90);
      const frames = [];
      for (let i = 0; i <= 86; i++) {
        kickFrame(i);
        frames.push(measurements(String(i)));
      }
      return frames;
    });
    const contact = frames[12],
      landed = frames[35],
      end = frames[86];
    if (style === "header") {
      expect(frames[4].chestLean).toBeLessThan(-0.15);
      expect(contact.chestLean).toBeGreaterThan(0.12);
      expect(frames[18].chestLean).toBeGreaterThan(contact.chestLean);
    } else {
      expect(
        frames[4].joints.foot_L[1] - frames[4].joints.foot_R[1],
      ).toBeGreaterThan(0.12);
      expect(
        contact.joints.foot_R[1] - contact.joints.foot_L[1],
      ).toBeGreaterThan(0.55);
      expect(
        Math.abs(contact.joints.head[1] - contact.joints.hips[1]),
      ).toBeLessThan(0.35);
      expect(
        Math.abs(contact.joints.head[2] - contact.joints.hips[2]),
      ).toBeGreaterThan(0.45);
      expect(landed.joints.hips[1]).toBeLessThan(0.65);
      expect(landed.joints.head[1]).toBeGreaterThan(0.12);
    }
    const point = style === "header" ? contact.forehead : contact.boot;
    const before = style === "header" ? frames[11].forehead : frames[11].boot;
    const after = style === "header" ? frames[13].forehead : frames[13].boot;
    expect(
      (after[0] - before[0]) * 0.7 + (after[2] - before[2]) * 0.6,
    ).toBeGreaterThan(0);
    expect(
      Math.hypot(
        point[0] - 0.7,
        point[1] - (style === "header" ? 2.1 : 3),
        point[2] - 0.6,
      ),
    ).toBeLessThan(0.48);
    expect(Math.min(...frames.map((f) => f.minimumY))).toBeGreaterThan(-0.025);
    expect(end.joints.head[1]).toBeCloseTo(frames[0].joints.head[1], 2);
    expect(end.leftSole).toBeCloseTo(0, 2);
    expect(end.rightSole).toBeCloseTo(0, 2);
  });

for (const style of ["header", "bicycle"])
  test(`${style} follows the shared jump and ball height`, async ({ page }) => {
    test.skip(process.env.E2E_CAMPUS_REVIEW !== "1");
    await page.goto(
      `http://127.0.0.1:3006/tools/team-world/motion-review.html?strike=${style}`,
    );
    await expect(page.locator("#result")).toContainText("ready", {
      timeout: 30000,
    });
    await page
      .getByRole("button", { name: "Review kick", exact: true })
      .click();
    const { poses } = JSON.parse(
      (await page.locator("#result").textContent())!,
    );
    const strike = poses.find(
      (pose: { label: string }) => pose.label === "Strike",
    );
    const landing = poses.find(
      (pose: { label: string }) => pose.label === "Landing",
    );
    expect(strike.worldY).toBeGreaterThan(style === "header" ? 0.3 : 0.5);
    expect(landing.worldY).toBe(0);
    if (style === "bicycle") expect(strike.rightThigh).toBeLessThan(-1);
    await page.screenshot({
      path: `outputs/campus/${style}-animation.png`,
      fullPage: true,
    });
  });

for (const style of ["header", "bicycle"])
  for (const [appearance, moving, floor] of [
    ["burgundy", false, 0],
    ["saffron", true, 0],
    ["sage", false, 2],
  ] as const)
    test(`${style} connects in shared simulation: ${appearance}, moving=${moving}, floor=${floor}`, async ({
      page,
    }) => {
      test.skip(process.env.E2E_CAMPUS_REVIEW !== "1");
      await page.goto(
        `http://127.0.0.1:3006/tools/team-world/motion-review.html?strike=${style}&simulation=1&appearance=${appearance}&moving=${moving ? 1 : 0}&floor=${floor}`,
      );
      await expect(page.locator("#result")).toContainText("ready");
      const frames = await page.evaluate(async () => {
        const path = "/tools/team-world/motion-review.ts";
        const { kickFrame, measurements } = await import(path);
        for (let i = 0; i < 100; i++) kickFrame(100);
        const result = [];
        for (let i = 0; i <= 90; i++) {
          kickFrame(i);
          result.push(measurements(String(i)));
        }
        return result;
      });
      const impact = frames[12];
      expect(impact.strike).toBe(style);
      const point = style === "header" ? impact.forehead : impact.boot;
      expect(
        Math.hypot(
          point[0] - impact.target.x,
          point[1] - impact.target.y,
          point[2] - impact.target.z,
        ),
      ).toBeLessThan(0.48);
      expect(
        Math.hypot(impact.ballVelocity[0], impact.ballVelocity[2]),
      ).toBeGreaterThan(4.5);
      expect(
        Math.min(...frames.map((f) => f.minimumY)) - floor,
      ).toBeGreaterThan(-0.025);
      expect(frames[90].worldY).toBe(floor);
      if (moving)
        expect(frames[90].worldZ - frames[0].worldZ).toBeGreaterThan(7);
    });

for (const style of ["header", "bicycle"])
  test(`${style} reduced motion preserves the simulation jump without the aerial rotation`, async ({
    page,
  }) => {
    test.skip(process.env.E2E_CAMPUS_REVIEW !== "1");
    await page.goto(
      `http://127.0.0.1:3006/tools/team-world/motion-review.html?strike=${style}&simulation=1&reduced=1`,
    );
    await expect(page.locator("#result")).toContainText("ready");
    const contact = await page.evaluate(async () => {
      const path = "/tools/team-world/motion-review.ts";
      const { kickFrame, measurements } = await import(path);
      for (let i = 0; i <= 12; i++) kickFrame(i);
      return measurements("contact");
    });
    expect(contact.worldY).toBeGreaterThan(0.3);
    expect(contact.joints.head[1] - contact.joints.hips[1]).toBeGreaterThan(
      0.7,
    );
    expect(contact.rightThigh).toBeGreaterThan(-0.8);
  });
