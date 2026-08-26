# Canvas package provenance

These prerelease package archives are generated, reviewable dependencies from
the private `dafepro/canvas` repository. They are committed so Zoomigo builds do
not need private GitHub or npm registry credentials.

| Field                | Value                                          |
| -------------------- | ---------------------------------------------- |
| Source repository    | `https://github.com/dafepro/canvas.git`        |
| Source commit        | `923bfce1360b743b0c5c3875e521f5c23ec7cdb3`     |
| Source commit date   | `2026-08-26T11:24:05-05:00`                    |
| Package version      | `0.1.0`                                        |
| Go rooms SDK         | `v0.0.0-20260826162405-923bfce1360b`           |
| Protocol version     | Exact version in the coordinated source commit |
| Pack tool            | pnpm `11.21.0`                                 |
| Runtime used to pack | Node.js `24.19.0`                              |

## SHA-256

| Archive                             | Digest                                                             |
| ----------------------------------- | ------------------------------------------------------------------ |
| `canvas-physics-client-0.1.0.tgz`   | `26887B49E2AD4E6C0DE9C463F8C25FD13E74A47D27852DFB7CB3C68EFE9B739B` |
| `canvas-physics-core-0.1.0.tgz`     | `A914EAEBEC44B74E972456DF905EB9661C3644328C046774E9C47956C85EC3E7` |
| `canvas-physics-protocol-0.1.0.tgz` | `C6529015464A2541EA2BBF247170ECDA6C255DBC1672A344B07CE545B95E584A` |

## Verification performed

At the source commit:

```powershell
go test ./pkg/roomsdk
pnpm test
pnpm --filter @canvas-physics/client exec tsc --noEmit
pnpm build
```

Result: the Go SDK package passed, the full Canvas suite passed 362 tests, the
client typecheck passed, and all three packages built. The coordinated change
lets a consumer exclude projected DOM controls from Canvas gesture routing,
preventing item-edit controls from being interpreted as empty-room taps. Core
and protocol archive digests are unchanged.

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
