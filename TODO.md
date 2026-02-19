# TODO

Persistent project backlog for JunkScout.

## Completed in this iteration

- [x] Facility page generation now includes manual Houston records and city-referenced IDs.
- [x] Sitemap generation now skips city pages with missing data and includes legal pages.
- [x] City page generation now:
  - [x] skips no-data cities
  - [x] filters nearby links to valid city slugs only
  - [x] server-renders initial result cards for crawlability
- [x] Facility page generation now server-renders key decision content (title, address, links, verified details block).
- [x] Build pipeline now auto-prunes stale generated city/facility directories.
- [x] Smoke checks now enforce city-data coverage and generated-dir drift checks.
- [x] Added legal placeholder pages (`/about/`, `/contact/`, `/privacy/`, `/terms/`, `/disclosure/`).
- [x] Added analytics scaffolding (`/analytics.js`, `data/analytics/config.json`, `data/analytics/tracking-plan.json`).
- [x] Homepage and template nav/footer links now avoid dead-end `#pro` anchors.
- [x] Added Dallas manual override build path (`npm run build:dallas`) with city-specific SEO copy and quick-start filters.
- [x] Dallas city page now blends curated override + fallback city data to preserve both quality and coverage.
- [x] City rules modal now supports both Houston and Dallas with official-source links.
- [x] Smoke checks now validate Dallas city-page presence and canonical/intent markers.

## Next (Phase B: Houston depth)

- [ ] Deepen Houston city page into a decision-ready guide:
  - [ ] who can use each option
  - [ ] accepted and not accepted materials
  - [ ] fees and minimums
  - [ ] hours and closure caveats
  - [ ] source links and last-verified dates
- [ ] Ensure Houston modal behavior is deterministic across local + live builds.
- [ ] Add clear "last verified" UI treatment on Houston facilities.

## Next (Phase B2: Dallas depth)

- [ ] Deepen Dallas manual dataset from 7 baseline records to 20+ high-confidence records:
  - [ ] municipal transfer + recycling options
  - [ ] major private landfill/transfer options
  - [ ] resident restrictions + proof requirements
  - [ ] source links + verified dates
- [ ] Add Dallas-specific modal behavior tests (city + facility contexts).
- [ ] Add clear "last verified" UI treatment on Dallas facilities.

## After (Phase C: facility SEO engine)

- [ ] Add nearby facilities block on facility pages.
- [ ] Add duplicate facility detection and canonical strategy.
- [ ] Add structured referral slots to high-intent facility pages (once traffic threshold is met).
- [ ] Wire analytics provider (`ga4` or `plausible`) and map event taxonomy to revenue KPIs.

## Expansion guardrails (Phase D)

- [ ] Complete TX <-> CA internal-linking lattice from homepage/state/city/facility pages.
- [ ] Expand California only after all city pages pass confidence threshold checks.
- [ ] Define and enforce a minimum "confidence to drive" score for every new city launch.
