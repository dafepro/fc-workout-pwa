# Canvas package provenance

These package archives are generated, reviewable dependencies from
the private `dafepro/canvas` repository. They are committed so Zoomigo builds do
not need private GitHub or npm registry credentials.

| Field                         | Value                                      |
| ----------------------------- | ------------------------------------------ |
| Source repository             | `https://github.com/dafepro/canvas.git`    |
| Package archive source commit | `11ebf12f451decc368712bce35833319cdab0395` |
| Package archive source date   | `2026-08-28T09:21:01-05:00`                |
| Package version               | `0.6.0`                                    |
| Go rooms SDK                  | `github.com/dafepro/canvas/server v0.6.0`  |
| Protocol version              | `8`                                        |
| Pack tool                     | pnpm `11.21.0`                             |
| Runtime used to pack          | Node.js `24.19.0`                          |

## SHA-256

| Archive                             | Digest                                                             |
| ----------------------------------- | ------------------------------------------------------------------ |
| `canvas-physics-client-0.6.0.tgz`   | `9DF2AD4F4E2F7EE0B6C98931A7846E7A806ED0A87CDFA4BCD72DC4E5B3850C48` |
| `canvas-physics-core-0.6.0.tgz`     | `9AF3588BF579C3C5F1B5FCC9256457EB749E6776167E69DA618195E302C11E4C` |
| `canvas-physics-protocol-0.6.0.tgz` | `0527FA9E30047BB2AEC2D7AC5E42C361561FE4280BF18B985893D9CE880291FA` |

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
