# TODO

Persistent project backlog for JunkScout.

## Now (Phase A: pipeline stability)

- [x] Fix `scripts/generate-facility-pages.js` to generate `/facility/<id>/index.html`.
- [x] Fix `scripts/generate-sitemap.js` to use city records correctly and include facility URLs.
- [x] Add deterministic CMD-friendly scripts: `build`, `build:texas`, `build:houston`, `preview`, `push`.
- [x] Add build and deploy documentation (`README.md`, `BUILD_SANITY_CHECKLIST.md`).
- [ ] Add automated smoke check script for key URLs and canonical tags.
- [ ] Add stale output pruning strategy for old city directories not in current city list.

## Next (Phase B: Houston depth)

- [ ] Deepen Houston city page into a decision-ready guide:
  - [ ] who can use each option
  - [ ] accepted and not accepted materials
  - [ ] fees and minimums
  - [ ] hours and closure caveats
  - [ ] source links and last-verified dates
- [ ] Ensure Houston modal behavior is deterministic across local + live builds.
- [ ] Add clear "last verified" UI treatment on Houston facilities.

## After (Phase C: facility SEO engine)

- [ ] Add city-to-facility links from cards when `facility_id` is present.
- [ ] Add nearby facilities block on facility pages.
- [ ] Add nearby cities block on facility pages.
- [ ] Implement duplicate facility detection and canonical strategy.

## Expansion guardrails (Phase D)

- [ ] Add TX<->CA internal linking patterns from homepage/state/city pages.
- [ ] Expand California only after template + internal linking checks pass.
- [ ] Set a minimum "confidence to drive" content threshold for new city pages.
