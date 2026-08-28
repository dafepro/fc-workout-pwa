# Canvas package provenance

These package archives are generated, reviewable dependencies from
the private `dafepro/canvas` repository. They are committed so Zoomigo builds do
not need private GitHub or npm registry credentials.

| Field                         | Value                                         |
| ----------------------------- | --------------------------------------------- |
| Source repository             | `https://github.com/dafepro/canvas.git`       |
| Package archive source commit | `bfbc188092f82333a1a1e8a6482f96119967b109`    |
| Package archive source date   | `2026-08-27T20:17:20-05:00`                   |
| Package version               | `0.4.1`                                       |
| Go rooms SDK                  | Not vendored by the local-only ZoomiGo Lounge |
| Protocol version              | `8`                                           |
| Pack tool                     | pnpm `11.20.0`                                |
| Runtime used to pack          | Node.js `24.19.0`                             |

## SHA-256

| Archive                             | Digest                                                             |
| ----------------------------------- | ------------------------------------------------------------------ |
| `canvas-physics-client-0.4.1.tgz`   | `183D073DED09A97451530965993CF819293B78D09C56D4CE96706A8B9B425601` |
| `canvas-physics-core-0.4.1.tgz`     | `7136B6723D50D9E6D89BB5D44DC5CC4E6833A7612B2CBE2AD5A8BA6A53668D36` |
| `canvas-physics-protocol-0.4.1.tgz` | `6A142948F1C907A48C026DFA4F829227BB5F53C549FF6F8801387909EFE179A5` |

## Verification performed

The package `prepack` lifecycle rebuilt all three TypeScript packages before
packing. ZoomiGo then verifies the integration with:

```powershell
pnpm test
pnpm typecheck
pnpm build
docker compose -f backend/compose.e2e.yaml run --rm browser-e2e pnpm test:browser e2e/pwa-team-lounge.spec.ts
```

The Lounge intentionally has no compatibility adapter for pre-0.4 room,
snapshot, item-revision, or inventory data. It seeds one current local room from
ZoomiGo's authenticated player ID and canonical predefined content.

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
