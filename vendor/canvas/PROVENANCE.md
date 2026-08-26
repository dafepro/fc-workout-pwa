# Canvas package provenance

These prerelease package archives are generated, reviewable dependencies from
the private `dafepro/canvas` repository. They are committed so Zoomigo builds do
not need private GitHub or npm registry credentials.

| Field                | Value                                          |
| -------------------- | ---------------------------------------------- |
| Source repository    | `https://github.com/dafepro/canvas.git`        |
| Source commit        | `9efe474e4cad3f307e56b58acb0ad278b2eaf118`     |
| Source commit date   | `2026-08-26T11:44:51-05:00`                    |
| Package version      | `0.1.0`                                        |
| Go rooms SDK         | `v0.0.0-20260826164451-9efe474e4cad`           |
| Protocol version     | Exact version in the coordinated source commit |
| Pack tool            | pnpm `11.21.0`                                 |
| Runtime used to pack | Node.js `24.19.0`                              |

## SHA-256

| Archive                             | Digest                                                             |
| ----------------------------------- | ------------------------------------------------------------------ |
| `canvas-physics-client-0.1.0.tgz`   | `B2B3A21963C32A445D65D49AE4DE40F8A4A041F0B4E09AAFE59DB8A477C19C92` |
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

Result: the Go SDK package passed, the full Canvas suite passed 363 tests, the
client typecheck passed, and all three packages built. The coordinated change
holds consumer-triggered item previews and scale/rotation commits until the
canonical transform catches up, preventing old projections from shaking the
local item during a server round trip. Core and protocol archive digests are
unchanged.

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
