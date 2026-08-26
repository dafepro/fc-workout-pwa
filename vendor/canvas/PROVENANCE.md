# Canvas package provenance

These prerelease package archives are generated, reviewable dependencies from
the private `dafepro/canvas` repository. They are committed so Zoomigo builds do
not need private GitHub or npm registry credentials.

| Field                | Value                                          |
| -------------------- | ---------------------------------------------- |
| Source repository    | `https://github.com/dafepro/canvas.git`        |
| Source commit        | `a70f50ed04e95eecf6a8c42b0b07351224dc30d5`     |
| Source commit date   | `2026-08-26T06:05:29-05:00`                    |
| Package version      | `0.1.0`                                        |
| Go rooms SDK         | `v0.0.0-20260826110529-a70f50ed04e9`           |
| Protocol version     | Exact version in the coordinated source commit |
| Pack tool            | pnpm `11.20.0`                                 |
| Runtime used to pack | Node.js `24.19.0`                              |

## SHA-256

| Archive                             | Digest                                                             |
| ----------------------------------- | ------------------------------------------------------------------ |
| `canvas-physics-client-0.1.0.tgz`   | `DB4E0FA610DC519C2BA1568982F8F6B2BF6BF06EF29EB000BF3B64B4B73A9342` |
| `canvas-physics-core-0.1.0.tgz`     | `A914EAEBEC44B74E972456DF905EB9661C3644328C046774E9C47956C85EC3E7` |
| `canvas-physics-protocol-0.1.0.tgz` | `C6529015464A2541EA2BBF247170ECDA6C255DBC1672A344B07CE545B95E584A` |

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
