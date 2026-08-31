import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

describe("connected runtime boundary", () => {
  it("keeps prototype fixtures out of production connected modules", () => {
    const applicationSources = sourceFiles(join(repositoryRoot, "app"));
    const offenders = applicationSources
      .filter((file) => !repositoryPath(file).startsWith("app/prototype/"))
      .filter((file) => !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file))
      .filter((file) =>
        /(?:from\s+|import\s*\()["'][^"']*mockData/u.test(
          readFileSync(file, "utf8"),
        ),
      )
      .map(repositoryPath);

    expect(offenders).toEqual([]);
    expect(existsSync(join(repositoryRoot, "app", "data", "mockData.ts"))).toBe(
      false,
    );

    const prototypeReferences = applicationSources
      .filter((file) => !repositoryPath(file).startsWith("app/prototype/"))
      .filter((file) => !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file))
      .filter((file) =>
        /["'][^"']*prototype\//u.test(readFileSync(file, "utf8")),
      )
      .map(repositoryPath);
    expect(prototypeReferences).toEqual(["app/state/auth-context.tsx"]);

    const connectedData = sourceFiles(join(repositoryRoot, "app", "data"))
      .filter((file) => !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(file))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(connectedData).not.toMatch(
      /Mason|Hill Striders|team-hill-striders|prototype-/u,
    );
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.[cm]?[jt]sx?$/u.test(entry.name)
        ? [path]
        : [];
  });
}

function repositoryPath(file: string): string {
  return relative(repositoryRoot, file).replaceAll("\\", "/");
}
