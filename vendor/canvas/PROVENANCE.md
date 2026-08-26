# Canvas package provenance

These prerelease package archives are generated, reviewable dependencies from
the private `dafepro/canvas` repository. They are committed so Zoomigo builds do
not need private GitHub or npm registry credentials.

| Field                | Value                                          |
| -------------------- | ---------------------------------------------- |
| Source repository    | `https://github.com/dafepro/canvas.git`        |
| Source commit        | `469634571d5658d1bb53200dcf3f323b74e82eb4`     |
| Source commit date   | `2026-08-25T18:15:08-05:00`                    |
| Package version      | `0.1.0`                                        |
| Go rooms SDK         | `v0.0.0-20260825231508-469634571d56`           |
| Protocol version     | Exact version in the coordinated source commit |
| Pack tool            | pnpm `11.20.0`                                 |
| Runtime used to pack | Node.js `24.19.0`                              |

## SHA-256

| Archive                             | Digest                                                             |
| ----------------------------------- | ------------------------------------------------------------------ |
| `canvas-physics-client-0.1.0.tgz`   | `07B6F4C5F06348B55C547F033FB1C88433C3CE06A9C0CAF5738697C1598C8658` |
| `canvas-physics-core-0.1.0.tgz`     | `A914EAEBEC44B74E972456DF905EB9661C3644328C046774E9C47956C85EC3E7` |
| `canvas-physics-protocol-0.1.0.tgz` | `8F40B0FFBE4A2E3998E923808592B2E732456A62AA926CE606B3DAD3B024481F` |

## Verification performed

From a clean Canvas checkout at the source commit:

```powershell
pnpm install --frozen-lockfile
pnpm vitest run test/package-artifacts.test.ts test/release-contract.test.ts test/library-boundaries.test.ts
```

Result: three files and four tests passed, including installation and builds in
clean external consumer projects.

## Rebuild

```powershell
pnpm --filter @canvas-physics/core pack --pack-destination ./artifacts
pnpm --filter @canvas-physics/protocol pack --pack-destination ./artifacts
pnpm --filter @canvas-physics/client pack --pack-destination ./artifacts
Get-ChildItem ./artifacts/*.tgz | Get-FileHash -Algorithm SHA256
```

Replace all three packages together, update the dependency paths and lockfile,
and update this manifest. Never update only one package or use a floating branch.
The Go rooms SDK must use the identical source commit when authenticated rooms
are enabled.
