# Canvas package provenance

These prerelease package archives are generated, reviewable dependencies from
the private `dafepro/canvas` repository. They are committed so Zoomigo builds do
not need private GitHub or npm registry credentials.

| Field                         | Value                                          |
| ----------------------------- | ---------------------------------------------- |
| Source repository             | `https://github.com/dafepro/canvas.git`        |
| Package archive source commit | `238d317a69f931560c60aa217465572098a270a6`     |
| Package archive source date   | `2026-08-26T19:25:57-05:00`                    |
| Package version               | `0.1.0`                                        |
| Go rooms SDK source commit    | `d12ffe9e056029e90c32d8e4e02d07f8f08195af`     |
| Go rooms SDK                  | `v0.0.0-20260826195321-d12ffe9e0560`           |
| Protocol version              | Exact version in the coordinated source commit |
| Pack tool                     | pnpm `11.21.0`                                 |
| Runtime used to pack          | Node.js `24.19.0`                              |

## SHA-256

| Archive                             | Digest                                                             |
| ----------------------------------- | ------------------------------------------------------------------ |
| `canvas-physics-client-0.1.0.tgz`   | `6D6BE0027AC5A78873CE2D6772485114BDE6968085FB97A4EEE404881A56DBBE` |
| `canvas-physics-core-0.1.0.tgz`     | `A914EAEBEC44B74E972456DF905EB9661C3644328C046774E9C47956C85EC3E7` |
| `canvas-physics-protocol-0.1.0.tgz` | `C6529015464A2541EA2BBF247170ECDA6C255DBC1672A344B07CE545B95E584A` |

## Verification performed

At the package archive source commit, with the Go rooms SDK subsequently
verified at its separately pinned source commit:

```powershell
go test ./pkg/roomsdk
pnpm test
pnpm --filter @canvas-physics/client exec tsc --noEmit
pnpm build
```

Result: 55 targeted durable-command, host simulation, and replication tests
passed and the client typecheck passed. Behaviorless items retain metadata in
checkpoints and host presentation frames, and rejected commands expose their
entity and operation so consumers can distinguish a failed delete from a late
drag update. Core and protocol archive digests are unchanged.

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
