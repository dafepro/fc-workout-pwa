# Authorization matrix (draft 0.1)

The API denies by default. Resource IDs and route knowledge never grant access. Club and team relationships are loaded by the server from active memberships and assignments.

| Capability                                | Entry owner / player       | Teammate                   | Assigned team coach | Same-club admin     | Unrelated authenticated user |
| ----------------------------------------- | -------------------------- | -------------------------- | ------------------- | ------------------- | ---------------------------- |
| View own full training entry              | Allow                      | —                          | —                   | —                   | —                            |
| View another player's full training entry | —                          | Deny/conceal               | Allow               | Allow               | Deny/conceal                 |
| Create a player training entry            | Own only                   | Own only                   | Deny initially      | Deny initially      | Deny                         |
| Delete recent player entry                | Own, within 24 hours       | Deny                       | Deny                | Deny                | Deny                         |
| View safe Team projection                 | Allow when active member   | Allow when active member   | Allow when assigned | Allow within club   | Deny/conceal                 |
| View safe leaderboard                     | Allow when active member   | Allow when active member   | Allow when assigned | Allow within club   | Deny/conceal                 |
| Send predefined reaction                  | To another active teammate | To another active teammate | Deny initially      | Deny initially      | Deny                         |
| View received reaction badges             | Own only                   | Own only                   | Allow when assigned | Allow within club   | Deny/conceal                 |
| Moderate/delete reactions                 | Deny                       | Deny                       | Future audited flow | Future audited flow | Deny                         |
| Save avatar configuration                 | Own only                   | Own only                   | Deny                | Deny                | Deny                         |

## Enforcement rules

1. Authentication produces an actor ID only; handlers load current roles and assignments for every protected request.
2. Player access requires the exact owner player ID.
3. Coach access requires an active assignment to the resource's team at request time.
4. Admin access requires an active administrator role for the resource's club.
5. Cross-club access is always denied, including for coaches and administrators.
6. Unauthorized private-resource reads return `404` so existence is not disclosed.
7. Authorization is enforced in the service/domain layer as well as route middleware; repository calls do not bypass it.
8. Logs record actor ID, action, decision, and opaque resource ID, but never raw performance, assessment, exhaustion, session secrets, or reaction message bodies.

## Reaction-specific checks

- sender identity is derived from the authenticated session, never the request body;
- sender and recipient must be different players;
- both must have overlapping active membership in the context team;
- the context team must match the viewed Team or leaderboard surface;
- rate limiting is checked and inserted in one database transaction;
- received badges are visible only to the recipient, assigned coaches, and same-club admins;
- exact negative grouping or rank labels are not stored or generated.

## Avatar-specific checks

- the target player is derived from the authenticated session, never from the path or body, so there is no cross-player write to conceal;
- a staff caller has no avatar of their own and is refused with `403` rather than a concealed `404`, because the route names no resource whose existence could leak;
- a save replaces the whole configuration, so no partial merge can preserve a layer the player removed.

## Audit events required before production

- session detail viewed by coach/admin;
- administrative account or assignment changed;
- training entry deleted or restored;
- reaction moderated or deleted;
- QR credential issued, revoked, or recovered;
- repeated authorization or rate-limit failures.
