import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packages = ["client", "core", "protocol"] as const;

describe("Canvas package contract", () => {
  it("pins only the complete Canvas 0.6.0 package set", async () => {
    const root = process.cwd();
    const packageDocument = JSON.parse(
      await readFile(resolve(root, "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    const workspace = await readFile(
      resolve(root, "pnpm-workspace.yaml"),
      "utf8",
    );

    for (const packageName of packages) {
      const archive = `canvas-physics-${packageName}-0.6.0.tgz`;
      expect(
        packageDocument.dependencies[`@canvas-physics/${packageName}`],
      ).toBe(`file:vendor/canvas/${archive}`);
      await access(resolve(root, "vendor/canvas", archive));
      const installed = JSON.parse(
        await readFile(
          resolve(
            root,
            "node_modules/@canvas-physics",
            packageName,
            "package.json",
          ),
          "utf8",
        ),
      ) as { version: string };
      expect(installed.version).toBe("0.6.0");
      await expect(
        access(
          resolve(
            root,
            "vendor/canvas",
            `canvas-physics-${packageName}-0.4.1.tgz`,
          ),
        ),
      ).rejects.toThrow();
    }

    expect(workspace).toMatch(
      /@canvas-physics\/core.*canvas-physics-core-0\.6\.0\.tgz/,
    );
    expect(workspace).toMatch(
      /@canvas-physics\/protocol.*canvas-physics-protocol-0\.6\.0\.tgz/,
    );
    expect(`${JSON.stringify(packageDocument)}\n${workspace}`).not.toMatch(
      /canvas-physics-(?:client|core|protocol)-0\.4\.1\.tgz/,
    );

    const goModule = await readFile(resolve(root, "backend/go.mod"), "utf8");
    expect(goModule).toMatch(/github\.com\/dafepro\/canvas\/server v0\.6\.0/u);
  });
});
