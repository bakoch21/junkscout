# Build Sanity Checklist

Run this checklist before every Cloudflare deploy.

## 1) Run build

```cmd
npm run build
```

If you are iterating only Houston:

```cmd
npm run build:houston
```

If you are iterating only Dallas:

```cmd
npm run build:dallas
```

## 2) Confirm generated files changed

```cmd
git status --short
```

Expected during content/template/script updates:
- `texas/.../index.html` and/or `california/.../index.html`
- `facility/.../index.html`
- `sitemap.xml`

## 3) Confirm output paths

Spot-check these files exist:
- `texas/houston/index.html`
- `texas/dallas/index.html`
- `facility/<some-id>/index.html`
- `sitemap.xml`
- `about/index.html`
- `privacy/index.html`
- `data/analytics/config.json`

## 4) Confirm canonical and metadata

Open 2-3 generated pages and verify:
- one canonical per page
- title and description are city/facility-specific
- JSON-LD exists and matches page intent

## 5) Confirm internal links

Check on generated pages:
- homepage links to state hubs
- state hub links to city pages
- city pages link to facility pages when IDs exist
- facility pages link back to city hubs

## 6) Confirm sitemap coverage

Validate quickly:

```cmd
findstr /C:"/texas/" sitemap.xml
findstr /C:"/california/" sitemap.xml
findstr /C:"/facility/" sitemap.xml
```

Also ensure no `undefined` URLs:

```cmd
findstr /C:"undefined" sitemap.xml
```

Expected: no matches for `undefined`.

## 7) Preview locally

```cmd
npm run preview
```

Open key pages:
- `/`
- `/texas/`
- `/texas/houston/`
- `/texas/dallas/`
- one facility page

## 8) Run smoke gate

```cmd
npm run verify:smoke
```

If this fails, fix before push.

## 9) Push

```cmd
npm run push -- "build: <what changed>"
```

After deploy, hard-refresh and verify live URLs.
