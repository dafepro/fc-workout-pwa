# Canvas package provenance

These package archives are generated, reviewable dependencies from
the private `dafepro/canvas` repository. They are committed so Zoomigo builds do
not need private GitHub or npm registry credentials.

| Field                         | Value                                      |
| ----------------------------- | ------------------------------------------ |
| Source repository             | `https://github.com/dafepro/canvas.git`    |
| Package archive source commit | `b67b79f7ce685d7526b88f68fe1058ba6cbecc89` |
| Package archive source date   | `2026-08-30T15:37:31-05:00`                |
| Package version               | `0.6.2`                                    |
| Go rooms SDK                  | `github.com/dafepro/canvas/server v0.6.2`  |
| Protocol version              | `8`                                        |
| Pack tool                     | pnpm `11.21.0`                             |
| Runtime used to pack          | Node.js `24.19.0`                          |

## SHA-256

| Archive                             | Digest                                                             |
| ----------------------------------- | ------------------------------------------------------------------ |
| `canvas-physics-client-0.6.2.tgz`   | `B4C64E4E173603B19FFCEA16A74AA8B20A9044847C9057EA49DF86A9074EFDF7` |
| `canvas-physics-core-0.6.2.tgz`     | `A00E6C7F541E3B7FC1AF4F17A785598083BA5C0D8C9C918FA9B24D161EF5900F` |
| `canvas-physics-protocol-0.6.2.tgz` | `7E8881490B7F50D6D7640B9795F69F2A3DFABE4C8D36F1C8F196D32A2CA8EF68` |

## Verification performed

The package `prepack` lifecycle rebuilt all three TypeScript packages before
packing. ZoomiGo then verifies the integration with:

```powershell
pnpm test
pnpm typecheck
pnpm build
docker compose -f backend/compose.e2e.yaml run --rm browser-e2e pnpm test:browser e2e/pwa-team-lounge.spec.ts
```

The Lounge intentionally has no compatibility adapter for pre-0.6 room,
snapshot, placement-reservation, item-revision, or inventory data. ZoomiGo uses
Canvas 0.6's application mutation authorization, outcome reconciliation,
transient actions, fenced room ownership, and graceful draining against the
same exact source generation as these archives.

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
