# JunkScout

JunkScout is an SEO-first static directory for dumps, landfills, transfer stations, and recycling drop-offs.

## CMD-first workflow

Run these from the repo root in Windows CMD.

### 1) Full deterministic build

```cmd
npm run build
```

This runs:
- facility data build
- Texas city data build
- Texas and California city page generation
- facility page generation
- sitemap generation
- stale generated page pruning (city/facility)

### 2) Texas build alias

```cmd
npm run build:texas
```

### 3) Fast Houston iteration

```cmd
npm run build:houston
```

This runs only what you need for Houston:
- rebuild Houston manual facilities
- regenerate `/texas/houston/`
- regenerate Houston-linked facility pages
- regenerate sitemap

### 4) Fast Dallas iteration

```cmd
npm run build:dallas
```

This runs only what you need for Dallas:
- rebuild Dallas manual facilities
- regenerate `/texas/dallas/`
- regenerate Dallas-linked facility pages
- regenerate sitemap

### 5) Local preview

```cmd
npm run preview
```

Default URL: `http://localhost:4173`

### 6) Push to trigger Cloudflare Pages deploy

```cmd
npm run push -- "your commit message"
```

If there are no local changes, this runs `git push` only.

### 7) Run quality gate

```cmd
npm run verify:smoke
```

Or run full build plus gate:

```cmd
npm run build:verified
```

### 8) Stale output pruning (safe by default)

Report only:

```cmd
npm run prune:report
```

Apply deletions:

```cmd
npm run prune:apply
```

## Build outputs

Generated static pages are written directly into the repo:
- city pages: `/<state>/<city>/index.html`
- facility pages: `/facility/<id>/index.html`
- sitemap: `/sitemap.xml`
- legal pages: `/about/`, `/contact/`, `/privacy/`, `/terms/`, `/disclosure/`

## Analytics placeholders

- Runtime tracker script: `/analytics.js`
- Config and tracking plan: `/data/analytics/`

## Sanity checks before push

Use `BUILD_SANITY_CHECKLIST.md` before every deploy.

## Backlog

Active backlog is tracked in `TODO.md`.
