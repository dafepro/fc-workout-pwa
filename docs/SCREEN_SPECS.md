# Player screen specifications

## Shared navigation

Bottom navigation:

1. Home
2. Log
3. Team
4. Leaders
5. Me

The prototype should include working routes for the first four. `Me` may begin as a simple profile/avatar placeholder.

## 1. Player home

Primary goals:

- Tell the player what to do next.
- Give a fast view of personal progress.
- Provide a small preview of team participation.

Content hierarchy:

1. Player avatar, first name plus last initial, and team.
2. Next workout or current goal card.
3. Primary `Log Session` action.
4. Weekly target and progress.
5. Compact personal metrics.
6. Seven-day recent activity summary.
7. Small team activity preview.

Suggested initial personal metrics:

- current streak
- longest streak
- sessions in rolling 30 days
- weekly goal completion

Effort points may be shown, but the formula must remain simple and should not reward unsafe volume.

## 2. Quick training entry

The coach-selected activity is the default. Other approved activities appear as secondary choices.

Activity-specific result inputs:

- Hill sprints: completed repetitions; show assigned rep duration as context.
- Timed run/walk: actual elapsed duration.
- Distance run: actual distance completed, with a simple unit choice determined by team settings.
- Recovery walk/jog: actual elapsed duration.

Shared fields:

- date within the past seven days
- time
- effort level, seven steps
- exhaustion level, seven steps
- optional collapsed workout note, private to the player and authorized staff

The note opens from **Add a note**, accepts at most 500 characters, and is
stored and rendered as plain text. It is not team-visible.

After saving:

- show a clear success state
- update home progress
- update team participation
- allow delete within 24 hours

## 3. Team activity

This should be a board, not an endless social feed.

Top section:

- current team challenge
- due window
- count completed
- row or grid of participant avatars

Weekly progress section:

- progress toward the team-defined session goal
- group players into Completed, One Away, and Keep Going
- use bars and status icons
- avoid showing raw workout results

Reaction section:

- select a teammate or a recent completion
- send one predefined reaction
- prevent spam with a basic cooldown in the real product; mock it in milestone 1

Consistency callout:

- `3 logs in the last 5 days` earns a recognizable automatic visual effect or badge

## 4. Leaderboards

Time filters:

- Weekly
- Rolling 30 Days
- Season

Ranking views:

- Effort
- Streaks
- Consistency

Recommended prototype leaderboards:

1. Weekly consistency score
2. Rolling 30-day participation points
3. Current streak

Do not rank raw athletic performance.

Make the top positions feel special, but show a clear message that every player's effort counts.

## 5. Me / profile placeholder

- avatar builder entry point (satisfied: opens the layered avatar builder)
- player name and team memberships
- personal assessment history link
- session history link
- QR/PIN security placeholder

Do not add editable free-form profile fields.

## 6. Prize boxes

The landing screen remains a short secondary loop, not another home dashboard:

1. Back to Today, Rewards heading, concise explanation, and one restrained Zoomi illustration.
2. Three values only: claim available, unopened ready, and earned total.
3. Daily freebie card. Claiming deposits a sealed box and changes the card to a quiet claimed state.
4. Grouped unopened boxes. Selecting one begins the opening flow.
5. Three recently earned items with actual art, rarity text, destination, and time.
6. `View all prizes` opens Collection/History with All, Team Lounge, and Avatar filters.

The reveal names the item and its destination and provides a real destination
link. Normal mystery boxes never disclose item rarity before opening. All
controls and artwork fit at 320 CSS pixels, and motion is optional.
