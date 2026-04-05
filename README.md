# Field Notes

A minimalist, static web journal that automatically displays your photos in a calendar-like strip layout. Powered by Vite.

## How it Works

The project reads original photos from the `data/` folder based on their date structure (`YYYY/MM/DD`), plus an optional undated `data/pre-2025/` archive, generates optimized image derivatives, and uses Vite's `import.meta.glob` to discover those generated assets at runtime. The journal strip uses lightweight thumbnails, while the lightbox opens a larger but still web-friendly version.

### Adding Photos

Place your image files (.jpg, .png, .gif, .webp) inside the `data` folder using a directory structure like this:
```text
data/
  YYYY/
    MM/
      DD/
        image1.jpg
        image2.jpg
  pre-2025/
    older-image.jpg
    another-older-image.jpg
```
*(Example: `data/2026/04/05/R0000040-2.jpg`)*

Photos in `data/pre-2025/` are rendered together at the bottom of the page in a single undated section.

Then run:

```bash
npm run images
```

`npm run dev`, `npm run build`, and `npm run preview` all run the image generator automatically before they start. If you add new photos while the dev server is already running, rerun `npm run images` to refresh the generated variants.

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

The workflow in `.github/workflows/deploy.yml` installs dependencies, generates the optimized image assets, builds the site, and publishes `dist/`.

The Vite config uses a relative asset base, so the built site works from a project Pages URL such as `https://<user>.github.io/<repo>/` without hard-coding the repository name.

## Image Optimization

- Generated assets live under `data/.generated/v1/` and are not the source of truth.
- Each source image gets a thumbnail for the journal strip and a larger lightbox-ready variant.
- The generator also writes a small metadata manifest so the lightbox can show camera settings without reading EXIF in the browser.
- Originals stay in `data/YYYY/MM/DD/` or `data/pre-2025/`.

## Tech Stack
- Vanilla HTML/CSS/JS
- Vite (For hot-reloading and static module bundling)
- Sharp (For generating optimized image variants)
