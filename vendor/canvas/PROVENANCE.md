# Canvas package provenance

These prerelease package archives are generated, reviewable dependencies from
the private `dafepro/canvas` repository. They are committed so Zoomigo builds do
not need private GitHub or npm registry credentials.

| Field                | Value                                          |
| -------------------- | ---------------------------------------------- |
| Source repository    | `https://github.com/dafepro/canvas.git`        |
| Source commit        | `f94bc54300cb50e15a3fd9e9fc58bd99a9da38b3`     |
| Source commit date   | `2026-08-26T07:33:21-05:00`                    |
| Package version      | `0.1.0`                                        |
| Go rooms SDK         | `v0.0.0-20260826123321-f94bc54300cb`           |
| Protocol version     | Exact version in the coordinated source commit |
| Pack tool            | pnpm `11.20.0`                                 |
| Runtime used to pack | Node.js `24.19.0`                              |

## SHA-256

| Archive                             | Digest                                                             |
| ----------------------------------- | ------------------------------------------------------------------ |
| `canvas-physics-client-0.1.0.tgz`   | `BAC2ADFBB67A7BCFFD3FC4B6E096A9CD7E07BDDABD64DB07013CCC410B139293` |
| `canvas-physics-core-0.1.0.tgz`     | `A914EAEBEC44B74E972456DF905EB9661C3644328C046774E9C47956C85EC3E7` |
| `canvas-physics-protocol-0.1.0.tgz` | `C6529015464A2541EA2BBF247170ECDA6C255DBC1672A344B07CE545B95E584A` |

## Verification performed

From a clean Canvas checkout at the source commit:

```powershell
pnpm install --frozen-lockfile
pnpm vitest run test/package-artifacts.test.ts test/release-contract.test.ts test/library-boundaries.test.ts
```

Result: the three release/artifact files and four contract tests passed,
including installation and builds in clean external consumer projects. The full
Canvas suite also passed: 55 files and 360 tests. This source change touches the
Go host-authorization request only; rebuilding all three JavaScript archives
produced the unchanged digests above.

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
