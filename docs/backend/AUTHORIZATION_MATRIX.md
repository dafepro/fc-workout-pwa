# Authorization matrix

**Status:** Maintained

The backend authorizes every request. Routes, frontend guards, hidden controls,
and possession of a resource ID do not grant access.

| Resource/action                                | Player                    | Coach                                  | Club administrator     | Platform administrator |
| ---------------------------------------------- | ------------------------- | -------------------------------------- | ---------------------- | ---------------------- |
| Own private training detail                    | Read                      | —                                      | —                      | —                      |
| Training detail for managed scope              | —                         | Assigned team                          | Own club               | Any club               |
| Delete through player window                   | Own entry before deadline | —                                      | —                      | —                      |
| Own reaction inbox/avatar/inventory            | Read/write as defined     | —                                      | —                      | —                      |
| Safe Team/leaderboard/Lounge projection        | Active team membership    | Assigned team where staff route exists | Own club               | Any club               |
| Manage team, roster, assignment                | —                         | Assigned team                          | Own club               | Any club               |
| Provision player                               | —                         | Assigned team and production-data gate | Own club and gate      | Any club and gate      |
| Deactivate player/account                      | —                         | —                                      | Own club               | Any club               |
| Manage clubs, global search, platform settings | —                         | —                                      | —                      | Yes                    |
| Read admin audit                               | —                         | —                                      | Own club               | Any club               |
| Manage staff/coach assignments                 | —                         | —                                      | Own club where exposed | Any club               |

## Enforcement invariants

- A player's `playerId` comes from the session, never a trusted body field.
- Coach authority comes from an active team assignment, not merely a shared
  club.
- Club-administrator authority requires a nonempty matching club.
- Platform administrators use the same authorization helpers; they do not
  bypass handler checks.
- Unauthorized private resources return concealed `404` where confirming
  existence would leak data.
- No staff role may call the player's self-delete flow for another person.
- Team projections are server-ranked and cannot contain raw athletic or
  assessment values.
- Player and staff authentication credentials cannot mint the other session
  type.
- Sensitive staff mutations require recent step-up and emit bounded audit
  records.
- Development/E2E capabilities require build/configuration gates in addition to
  authentication.

## Reactions and Lounge

Reactions require distinct sender/recipient players, active shared membership,
an allowlisted type/context, idempotency, and the rolling limit. The client
cannot submit display text, rank, athletic values, or a recipient-owned badge
message.

Lounge socket tickets and placement/edit permits bind the actor, team, room,
Canvas generation, definition/entity revision, operation, target transform, and
expiry as applicable. Only the owner can edit a current-day owned item. Trusted
Canvas acceptance/rejection, not browser timeout, finalizes a consumed hold.

## Audit boundary

Authentication and admin audit rows use predefined event/action types and
bounded metadata. They must not contain PINs, QR values, passwords, TOTP seeds,
recovery codes, session tokens, raw training values, or arbitrary request
bodies.
