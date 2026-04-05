# AGENTS.md

## Overview

This repository is a small Vite-powered static photo journal.

- `index.html` provides the page shell and font imports.
- `js/app.js` discovers images with `import.meta.glob(...)`, groups them by day, sorts dates descending, renders the journal, and handles the lightbox.
- `style.css` contains the full visual system and interaction styling.
- `data/YYYY/MM/DD/*` is the source content. New photos appear automatically when they follow this folder structure.
- `dist/` is generated build output, not the source of truth.

## Working Rules

- Prefer editing source files only: `index.html`, `js/app.js`, `style.css`, `README.md`, and content under `data/` when needed.
- Do not hand-edit `dist/` unless the user explicitly asks for generated output changes.
- Do not hand-edit `node_modules/`.
- Preserve the date-based import flow. Avoid replacing `import.meta.glob` with manual image lists.
- Keep the current aesthetic direction intact unless the user asks for a redesign: sparse layout, editorial typography, muted palette, lightweight motion.
- If you add photos for testing or examples, place them under `data/YYYY/MM/DD/`.

## Commands

- `npm run dev` starts the Vite dev server.
- `npm run build` produces the production build in `dist/`.
- `npm run preview` serves the built site locally.

## Validation

- Run `npm run build` after changing HTML, CSS, or JS.
- Manually verify the main interactions when relevant:
  - images load from `data/`
  - month separators and day labels render correctly
  - lightbox open/close works via click and `Escape`
  - horizontal image strip scroll/drag still works
  - empty state still renders if no images are found

## Notes

- There is no automated test suite or lint setup at the moment.
- The repo is intentionally simple. Avoid introducing frameworks, build plugins, or extra tooling unless the user asks for them.
