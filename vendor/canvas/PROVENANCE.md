# Canvas package provenance

These prerelease package archives are generated, reviewable dependencies from
the private `dafepro/canvas` repository. They are committed so Zoomigo builds do
not need private GitHub or npm registry credentials.

| Field                | Value                                          |
| -------------------- | ---------------------------------------------- |
| Source repository    | `https://github.com/dafepro/canvas.git`        |
| Source commit        | `af4e1a71f457ce784aaf396b027a6f233e720ad6`     |
| Source commit date   | `2026-08-26T09:10:01-05:00`                    |
| Package version      | `0.1.0`                                        |
| Go rooms SDK         | `v0.0.0-20260826141001-af4e1a71f457`           |
| Protocol version     | Exact version in the coordinated source commit |
| Pack tool            | pnpm `11.21.0`                                 |
| Runtime used to pack | Node.js `24.19.0`                              |

## SHA-256

| Archive                             | Digest                                                             |
| ----------------------------------- | ------------------------------------------------------------------ |
| `canvas-physics-client-0.1.0.tgz`   | `1382169D1827FA46E4D1ECE02266D8B174A7F83A2C76A75D8DE5741D2D21018D` |
| `canvas-physics-core-0.1.0.tgz`     | `A914EAEBEC44B74E972456DF905EB9661C3644328C046774E9C47956C85EC3E7` |
| `canvas-physics-protocol-0.1.0.tgz` | `C6529015464A2541EA2BBF247170ECDA6C255DBC1672A344B07CE545B95E584A` |

## Verification performed

At the source commit:

```powershell
go test ./pkg/roomsdk
pnpm vitest run packages/client/src/overlay-projection.test.ts packages/client/src/client.test.ts
pnpm --filter @canvas-physics/client build
```

Result: the Go SDK package passed, the two targeted client files passed 12
tests, and the client package built. The coordinated change lets a host
canonicalize durable item metadata and exposes that immutable metadata to the
client overlay projection. Core and protocol archive digests are unchanged.

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
