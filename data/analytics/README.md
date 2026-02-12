# Analytics Placeholder

This folder is the source of truth for JunkScout analytics configuration and tracking definitions.

## Files

- `config.json`: runtime config read by `/analytics.js`
- `tracking-plan.json`: event taxonomy and required properties

## Notes

- Static sites cannot write server-side event logs directly into this folder at runtime.
- The current implementation stores a rolling local queue in browser `localStorage`.
- To activate production reporting, set `provider` in `config.json` and load that provider's script (GA4, Plausible, etc.).

