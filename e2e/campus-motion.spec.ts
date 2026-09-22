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
  test(`${style} placeholder follows the shared jump and ball height`, async ({
    page,
  }) => {
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
      (pose: { label: string }) => pose.label === "Right-foot landing",
    );
    expect(strike.worldY).toBeGreaterThan(style === "header" ? 0.3 : 0.5);
    expect(landing.worldY).toBe(0);
    if (style === "bicycle") expect(strike.rightThigh).toBeLessThan(-1);
    await page.screenshot({
      path: `outputs/campus/${style}-placeholder.png`,
      fullPage: true,
    });
  });
