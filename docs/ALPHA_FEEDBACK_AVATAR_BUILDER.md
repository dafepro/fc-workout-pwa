# Alpha feedback: Avatar Builder

Status: implemented and validated on `codex/avatar-studio-v1`.

## Feedback and acceptance criteria

### Isolated option previews

- Choice controls show only the selected part, never a complete avatar.
- People, kits, hats, glasses, and effects each use a crop suited to that part.
- Accessible names remain available without printing a label below every tile.

### People first; animals earned

- The starting catalog contains three distinct people shapes.
- The default person uses a non-racial blue color.
- At least three animal shapes appear locked as advancement rewards.
- Advancement requirements are illustrative until progression inventory is
  connected; the alpha only proves the locked presentation and data shape.

### Independent gear sublayers

- `Gear` remains one top-level category.
- Hats and glasses are separate sublayers within Gear and can be equipped at the
  same time.
- Choosing another hat replaces the current hat; choosing other glasses replaces
  the current glasses.

### Minimal copy

- Actions read `Save` and `Reset`.
- The preview omits player name, generated look description, and “live preview”
  chrome.
- Choice names are accessible to assistive technology and available as tooltips,
  but are not printed beneath every visual option.
- Short category and Gear sublayer names remain visible because they provide
  navigation structure.

### Colors and backgrounds

- The only background style is `Solid`, controlled by a color input.
- Avatar primary color and accent color use matching color inputs.
- The defaults are blue with a dark violet accent; renderers may derive lighter
  and darker shades from those colors.

### Animated effect proof

- At least one background effect animates in the live avatar.
- The effect is composable with the solid background and every avatar layer.
- Animation stops when the operating system requests reduced motion.

### Compact selection proposal

Replace large labeled cards with a compact token tray: circular item-only tokens
in a horizontally scrollable row, with a strong selected ring and a small lock
badge when unavailable. The tray keeps roughly four choices visible at 320px,
scales without making the page dramatically taller, and preserves 44px targets.
This alpha implements the tray so it can be evaluated in the working Studio.

## Deferred

- Real advancement thresholds and player inventory.
- Server-authoritative unlock validation.
- Multiple saved looks, rarity, currency, and unlock celebration flows.
