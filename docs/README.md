# Documentation index

**Status:** Maintained

This index is the entry point for current ZoomiGo documentation. Git history is
the archive for completed plans, implementation journals, and alpha feedback;
those records do not remain in the repository head.

## Status convention

- **Maintained** documents describe the current product or an operating
  procedure and must change with the code they describe.
- **Decision register** documents contain only choices that still need an
  owner. Settled implementation history belongs in Git.
- **Candidate** documents describe an explicitly unapproved option. A candidate
  is not a roadmap commitment or a production contract.

Every implementation plan should be short-lived. Merge its durable product
rules into a maintained document, move unfinished trigger-based ideas to
[FUTURE_WORK.md](FUTURE_WORK.md), and delete the plan when the work closes.

## Product sources of truth

- [PRODUCT_BRIEF.md](PRODUCT_BRIEF.md) — audience, value, and product boundary
- [avatar/intent.md](avatar/intent.md) — product intent for the replacement
  animated 3D avatar system
- [avatar/avatar-architecture.md](avatar/avatar-architecture.md) — **Proposed**
  technical architecture for the replacement avatar platform
- [UX_AND_SAFETY_RULES.md](UX_AND_SAFETY_RULES.md) — non-negotiable youth-safety
  and visibility rules
- [SCREEN_SPECS.md](SCREEN_SPECS.md) — current player and staff surfaces
- [DOMAIN_MODEL.md](DOMAIN_MODEL.md) — maintained conceptual model and authority
  boundaries
- [OPEN_DECISIONS.md](OPEN_DECISIONS.md) — unresolved owner decisions only
- [ROADMAP.md](ROADMAP.md) — current ordered work and release gates
- [FUTURE_WORK.md](FUTURE_WORK.md) — dormant ideas preserved with explicit
  activation triggers
- [STAFF_CONSOLE.md](STAFF_CONSOLE.md) — current staff roles, capabilities, and
  security contract

## Engineering and operations

- [DEV_ENVIRONMENT.md](DEV_ENVIRONMENT.md) — disposable preview environment
- [PRODUCTION_RUNBOOK.md](PRODUCTION_RUNBOOK.md) — provisioning, release, and
  production operation
- [OBSERVABILITY.md](OBSERVABILITY.md) — implemented logs, metrics, collection,
  and capacity gates
- [PRODUCT_ANALYTICS.md](PRODUCT_ANALYTICS.md) — implemented first-party product
  analytics and its known gaps
- [VISUAL_REGRESSION.md](VISUAL_REGRESSION.md) — image-baseline workflow
- [TEAM_LOUNGE_PERFORMANCE_BUDGET.md](TEAM_LOUNGE_PERFORMANCE_BUDGET.md) — Lounge
  device qualification contract
- [TEAM_LOUNGE_STARLIGHT_CAMP.md](TEAM_LOUNGE_STARLIGHT_CAMP.md) — **Candidate**
  theme awaiting visual approval
- [backend/API.md](backend/API.md) — current HTTP surface and invariants
- [backend/AUTHORIZATION_MATRIX.md](backend/AUTHORIZATION_MATRIX.md) — current
  access-control matrix
- [backend/BACKUP_AND_RESTORE.md](backend/BACKUP_AND_RESTORE.md) — backup formats
  and isolated restore
- [backend/LIVE_RESTORE_RUNBOOK.md](backend/LIVE_RESTORE_RUNBOOK.md) — offline
  cutover and rollback
- [backend/PRODUCTION_APPROVAL_CHECKLIST.md](backend/PRODUCTION_APPROVAL_CHECKLIST.md)
  — dated real-youth-data approvals

Component-local details remain next to their implementation:

- [../content/avatar/README.md](../content/avatar/README.md)
- [../content/avatar/ARTIST_HANDBOOK.md](../content/avatar/ARTIST_HANDBOOK.md)
- [../content/avatar/ASSET_PRODUCTION_LIST.md](../content/avatar/ASSET_PRODUCTION_LIST.md)
- [../backend/README.md](../backend/README.md)
- [../app/team-lounge/README.md](../app/team-lounge/README.md)
- [../deploy/secrets/README.md](../deploy/secrets/README.md)
- [../infra/digitalocean/README.md](../infra/digitalocean/README.md)
- [../vendor/canvas/PROVENANCE.md](../vendor/canvas/PROVENANCE.md)
