# Staff console implementation progress

Status: **In progress. Started 2026-08-08.**
Design and requirements: `STAFF_CONSOLE_DESIGN.md`. Backlog entry: `ROADMAP.md`
items 9 and 9a.

This file is the execution record for that design. The design document stays
frozen as the specification; this one says what has actually been built, what
was decided along the way, and what is left. Update it as each phase lands, not
at the end.

## Target for this effort

Phases 0, 1, and 2 — sign-in entry, staff identity, and the operator console —
released to production with a working `platform_admin` login. Phase 3 (coach
console) and phase 4 (assessments) are deliberately out of scope here and keep
their own releases.

## Decisions taken during implementation

These closed open items from `STAFF_CONSOLE_DESIGN.md` §8 and are recorded in
`OPEN_DECISIONS.md` as the durable home.

| Question                         | Resolution                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Access gate mechanism (§8.3)     | Cloudflare Zero Trust Access on `/staff/*`, provisioned in OpenTofu, one-time PIN identity                    |
| Staff session lifetimes (§8.4)   | 30 minutes idle, 8 hours absolute, 5-minute step-up window, no remembered device                              |
| Production data gate (SEC-7)     | `PRODUCTION_DATA_APPROVED=true` in production, so the console may provision real players                      |
| Staff credential delivery (§8.2) | Interim: the operator bootstrap prints a setup link and temporary password on the VM, handed over out of band |

## Phase status

| Phase                | Requirements                             | Status                                                         |
| -------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| 0 — sign-in entry    | REQ-101–105                              | Built; REQ-104 staff half and REQ-105 timing land with phase 1 |
| 1 — staff identity   | REQ-106, 107, 201–208, 301–305, 401, 402 | Not started                                                    |
| 2 — operator console | REQ-601–610, 701–704                     | Not started                                                    |
| Access gate          | REQ-402                                  | Not started                                                    |
| Release              | —                                        | Not started                                                    |

## Log

### 2026-08-08 — planning

- Read the design, confirmed the current-state constraints it lists are still
  true in the tree, and broke the work into the phases above.
- Closed the four open decisions in the table above with the product owner.

### 2026-08-08 — phase 0

- `/login` is now a server component that redirects a live session by role
  (REQ-104) and renders `LoginEntry`, which chooses between the PIN form and the
  scan prompt from the fragment alone. The fragment read and `replaceState`
  strip are unchanged, so REQ-103 holds.
- Every sign-in failure now shows one message, so wrong PIN and unknown code are
  indistinguishable in the UI (REQ-105).
- `AuthGate` no longer special-cases the literal `/login`: it skips the player
  shell for the sign-in page and the whole `/staff` tree, which is what lets the
  console render without any player chrome.
- Route literals moved to `app/content/routes.ts` so the player bundle can name
  the staff entry without importing console code.

**Found, and deferred into phase 1 rather than papered over:** REQ-105 also
requires the four failure cases to share a timing class. They do not today —
`internal/authn/service.go` deliberately skips Argon2 for a malformed or unknown
credential, which is a real DoS protection but makes "no such code" measurably
faster than "wrong PIN". The fix is a dummy Argon2 computation on the miss path,
which keeps the single-slot limit intact. It belongs with phase 1 because the
audit row for an unknown credential (REQ-703) needs migration A's new event
type and touches the same function.
