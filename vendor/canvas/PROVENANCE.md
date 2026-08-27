# Canvas package provenance

These package archives are generated, reviewable dependencies from
the private `dafepro/canvas` repository. They are committed so Zoomigo builds do
not need private GitHub or npm registry credentials.

| Field                         | Value                                         |
| ----------------------------- | --------------------------------------------- |
| Source repository             | `https://github.com/dafepro/canvas.git`       |
| Package archive source commit | `20d0d6a67408fc65ba6df6b7b76ab2844e7df9be`    |
| Package archive source date   | `2026-08-27T14:44:11-05:00`                   |
| Package version               | `0.4.0`                                       |
| Go rooms SDK                  | Not vendored by the local-only ZoomiGo Lounge |
| Protocol version              | `8`                                           |
| Pack tool                     | pnpm `11.21.0`                                |
| Runtime used to pack          | Node.js `24.19.0`                             |

## SHA-256

| Archive                             | Digest                                                             |
| ----------------------------------- | ------------------------------------------------------------------ |
| `canvas-physics-client-0.4.0.tgz`   | `26F9296D9F522B883FF7B1EDB0FA192DDF052ADC1F4FF417D5B004D068AEA9B5` |
| `canvas-physics-core-0.4.0.tgz`     | `B0EDCC0FC7D443DD18E7E8BAF6424F988AC8322DEF1953E046255B56DD41CC10` |
| `canvas-physics-protocol-0.4.0.tgz` | `639311E54905A9EBB92ED7F234232F2B174A8B91D2A3AD47476083766D85FD23` |

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
