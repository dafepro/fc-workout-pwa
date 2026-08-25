# Prize Boxes UX manual test

Use a disposable player on the development environment. Test once near 320 CSS
pixels and once at a normal phone width.

## Today badge

1. Open Today before claiming the daily freebie.
2. Confirm **View prize boxes** does not count the merely claimable freebie as unopened.
3. Open Prize boxes, claim the daily box, and return to Today.
4. Confirm the row now shows `1 unopened` (plus any already-earned plan boxes).

## Claim and open separation

1. Open **Prize boxes** and verify Today, the Rewards heading, and help are immediately visible.
2. Confirm there is no Claim now / Ready to open / Earned total summary strip.
3. On a Pixel-class portrait viewport, confirm all four paws, the prize box, and Zoomi's tail remain inside the header with a genuinely transparent background.
4. Scroll halfway down the page, open **How Prize Boxes work**, and confirm it covers the viewport rather than the card. Rotate once, scroll the panel if needed, then close it with both × and Escape.
5. Tap **Claim daily box** once.
6. Confirm the daily card becomes a quiet claimed state and no item or rarity is revealed.
7. Confirm **Your boxes** gains one sealed box.
8. Reload the page. Confirm the box is still waiting and no duplicate daily box appears.
9. Tap one box. Confirm the opening control disables while the request is in flight.
10. Confirm the reveal shows actual item art, name, rarity text, and Avatar or Team Lounge destination.
11. Use the destination action, or keep it in the collection. Reload and confirm the box cannot be reopened or rerolled.

## Collection and history

1. Open **View all prizes**.
2. Confirm Collection tiles show actual art, item name, rarity, destination, and a usable destination link.
3. Switch among All, Team Lounge, and Avatar; confirm unrelated items disappear.
4. Open History. Confirm entries show source and date in newest-first order.
5. Use Back to Prize boxes at the top; confirm return navigation is never buried at the page bottom.

## Visual and accessibility review

- Zoomi is a short-coated quadruped with four paws and never holds the box.
- Zoomi appears only in the header; the prize becomes the reveal focus.
- Unopened boxes disclose no item rarity.
- Rarity always has readable text and never relies on color alone.
- No horizontal page overflow appears at 320 pixels; the unopened rail may scroll horizontally.
- With reduced motion enabled, the reveal remains understandable without animation.
- Keyboard focus reaches help, claim, unopened boxes, reveal actions, filters, and back links in visual order.
