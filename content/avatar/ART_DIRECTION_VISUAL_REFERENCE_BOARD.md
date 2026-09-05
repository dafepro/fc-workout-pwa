# ZoomiGo avatar art-direction visual reference board

**Status:** Approved direction and pre-production review contract

**Audience:** Art directors, character artists, technical artists, riggers, and
reviewers

This document defines the visual target for production avatar work. It does not
replace the [artist handbook](ARTIST_HANDBOOK.md), production asset list, or
machine-readable contracts. The generated engineering GLBs and
`art-direction/zoomigo-player-turnaround-v1.png` are pipeline fixtures, not
approved style references.

## Direction lock

The target is **toon-shaded / cel-shaded 3D** with a graphic, illustrated, or
comic-book presentation. On a scale where 1 is highly stylized and 10 is
photorealistic, target roughly **4/10**.

Build modeled or sculpted forms with deliberate shape design. Characters should
be expressive and funny rather than cute, with readable silhouettes, strong
graphic color separation, and believable construction. Non-photorealistic
rendering techniques are welcome when they survive the browser pipeline and
support these goals.

Avoid these looks:

- Bitmoji- or Snapchat-style avatars;
- soft, rounded, bubbly 3D;
- toy-like characters;
- chibi proportions;
- photorealism or realistic child scans;
- heavy anime styling;
- a full dark or black outline around every visible edge.

## Shape, face, and surface language

- Design the outer silhouette first, then major planes and overlaps, then
  supporting detail. Do not let micro-detail rescue an unclear shape.
- Use graphic eyes, expressive eyebrows, and highly readable mouth shapes. Avoid
  glossy, realistic eyeballs and facial detail that depends on realistic anatomy.
- Expressions may become funny and exaggerated while remaining positive and
  compatible with the semantic expression contract.
- Use broad color blocking and deliberate material separation. Surface detail
  supports the form; it does not replace it.

## Selective contour rule

Use selective contour accents to reinforce important silhouettes, facial
features, garment overlaps, and major form breaks. Do not use a uniform heavy
black outline around every mesh edge.

Contours should help the model read as illustrated or comic-book 3D while
preserving depth and material separation. Review their weight and visibility at
hero, customizer, lounge-near, and lounge-far sizes. Very small internal linework
that disappears at normal gameplay size must not drive geometry, texture, or
material complexity.

## Clothing baseline and expansion

Launch clothing is recognizable athletic or casual sportswear: soccer jerseys,
training tees, shorts, joggers, warm-up jackets, socks, cleats, trainers,
hoodies, simple caps or beanies, and basic sport accessories. Favor strong
silhouettes, simple panel breaks, broad color blocking, a small number of
readable seams, cuffs, and soles, and believable sports construction.

Ordinary launch pieces must not read as fantasy armor, superhero costumes,
sci-fi uniforms, or heavily decorated game loot. More exaggerated comic or
game-world treatments belong in later reward items, themed sets, seasonal
cosmetics, and full-body costumes.

## Pre-production and review workflow

Production modeling begins only after the selected style direction passes the
early review stages:

1. **Visual development and style exploration:** assemble references, shape
   studies, palette studies, face studies, and contour tests.
2. **Two to three distinct style directions:** present genuinely different
   proposals rather than minor palette variations. Include a clay render and a
   representative beauty render for each.
3. **Direction selection:** record one approved direction and rejected traits;
   do not average incompatible proposals together.
4. **Base-character blockout:** establish proportion, silhouette, major planes,
   and graphic feature placement before production topology.
5. **Turnaround review:** submit front, three-quarter (3/4), side, and back views
   plus a neutral-light turntable.
6. **Phone-size/readability review:** review the blockout and contour tests at
   hero, customizer, lounge-near, and lounge-far sizes.
7. **Production model:** proceed from the approved blockout without silently
   changing the proportion or shape language.
8. **Topology, material, and expression review:** provide a topology/wireframe
   review, material studies, expression combinations, a clay render, and a
   beauty render.
9. **Rig and technical-art gate:** choose and validate the face implementation,
   lock the family rig, and verify GLB export, deformation, budgets, and runtime
   compatibility.
10. **Golden-path wardrobe and browser validation:** fit the first jersey,
    shorts, footwear, hair, and rigid hat; then validate the full combination at
    all required browser review sizes before scaling production.

Every intermediate delivery is a **WIP review**, not approval by implication.
The selected turnaround, turntable, clay render, beauty render, and
topology/wireframe review become the comparison set for later artists.

## Approved-style checklist

A later artist can use this checklist without relying on memory:

- [ ] The result reads as stylized graphic 3D at about 4/10 realism.
- [ ] Forms look modeled or sculpted, with intentional planes and silhouettes.
- [ ] The face uses graphic eyes, brows, and mouth shapes and supports clear,
      exaggerated expression.
- [ ] Color blocks and material breaks remain distinct at phone size.
- [ ] Contours are selective accents, not a uniform heavy outline.
- [ ] Launch clothing reads as believable athletic or casual sportswear.
- [ ] The design avoids bubbly, toy-like, chibi, photoreal, scan-like, and heavy
      anime cues.
- [ ] Hero, customizer, lounge-near, and lounge-far reviews all pass.
- [ ] The work matches the approved turnaround and beauty-render comparison set.
- [ ] Technical choices pass the family rig, GLB, budget, and browser gates.
