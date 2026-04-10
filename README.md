# Field Notes

A minimalist, static web journal that automatically displays your photos in a calendar-like strip layout. Powered by Vite.

## How it Works

The project reads original photos from the local-only `data/` folder based on their date structure (`YYYY/MM/DD`, or `YYYY/MM` for month-level photos), plus optional undated sections for `data/portraits/`, `data/japan-2023/`, and `data/archive/`, generates optimized image derivatives, and uses Vite's `import.meta.glob` to discover those generated assets at runtime. The homepage shows the dated journal and archive, while `data/portraits/` and `data/japan-2023/` render on their own pages at `/portraits/` and `/japan-2023/`.

### Adding Photos

Place your image files (.jpg, .png, .gif, .webp) inside the `data` folder using a directory structure like this:
```text
data/
  YYYY/
    MM/
      month-image.jpg
      DD/
        image1.jpg
        image2.jpg
  portraits/
    portrait-1.jpg
    portrait-2.jpg
  japan-2023/
    tokyo/
      frame-1.jpg
    kyoto/
      frame-2.jpg
  archive/
    older-image.jpg
    another-older-image.jpg
```
*(Example: `data/2026/04/05/R0000040-2.jpg`)*

Original photos under `data/` are the local source of truth and are ignored by Git. The only photo assets that should be committed are the generated derivatives in `data/.generated/v1/`.

Photos placed directly under `data/YYYY/MM/` render at the bottom of that month without a specific day label.

Photos in `data/portraits/` render on the dedicated `/portraits/` page in a simple grid.

Photos in `data/japan-2023/` render on the dedicated `/japan-2023/` page. Its first-level subfolders are rendered as large section dividers, similar to year separators on the homepage.

Photos in `data/archive/` are rendered together at the bottom of the page in a single undated archive section.

Then run:

```bash
npm run images
```

`npm run dev`, `npm run build`, and `npm run preview` all run the image generator automatically before they start. If you add new photos while the dev server is already running, rerun `npm run images` to refresh the generated variants.

When you commit photo changes, commit the updated files under `data/.generated/v1/` and `data/.generated/v1/manifest.json`, not the original files under `data/YYYY/...`, `data/portraits/`, `data/japan-2023/`, or `data/archive/`.

### Development

To start the development server:

```bash
npm install
npm run dev
```

The app will generate web-sized derivatives first, then start Vite.

### Production Build

If you want to host your field notes online (e.g. GitHub Pages or Vercel):

```bash
npm run build
```

Vite will package your site into the `dist/` folder, completely optimized and minified.

### GitHub Pages

This repo is set up to deploy to GitHub Pages with GitHub Actions.

1. Push the repository to GitHub.
2. Open `Settings -> Pages`.
3. Set the source to `GitHub Actions`.
4. Push to the `main` branch to trigger a deploy.

The workflow in `.github/workflows/deploy.yml` installs dependencies, reuses the committed generated image assets, builds the site, and publishes `dist/`. If local originals are present, the generator can refresh derivatives first; if they are absent, the existing generated assets are preserved and used as-is.

The Vite config uses a relative asset base, so the built site works from a project Pages URL such as `https://<user>.github.io/<repo>/` without hard-coding the repository name.

## Image Optimization

- Generated assets live under `data/.generated/v1/` and are the only photo assets committed to Git.
- Each source image gets a thumbnail for the journal strip and a larger lightbox-ready variant.
- Generated filenames are derived from opaque IDs rather than the original source paths.
- The generator also writes a small metadata manifest so the lightbox can show camera settings without reading EXIF in the browser.
- Originals stay in `data/YYYY/MM/`, `data/YYYY/MM/DD/`, `data/portraits/`, `data/japan-2023/`, or `data/archive/` as local-only source material.

## Git Tracking Model

- Git ignores the raw `data/` photo tree and tracks only `data/.generated/v1/`.
- Run `npm run images` after adding or editing local originals so the committed derivatives stay in sync.
- `git rm -r --cached data` removes files from Git's index only; it does not delete your local originals from disk.
- After removing raw photos from the index, re-add the generated output with `git add -f data/.generated/v1`.
- For a one-time cleanup of historical raw photo blobs, use `git-filter-repo` from a fresh clone instead of `git filter-branch`, then force-push the rewritten refs.

## Tech Stack
- Vanilla HTML/CSS/JS
- Vite (For hot-reloading and static module bundling)
- Sharp (For generating optimized image variants)
