# Tuk (ទុក) — paste, capture, keep

A fast, local-first screenshot scratchpad that lives entirely in your browser.
No sign-up, no server, no upload — everything is stored on your own device in
IndexedDB. Paste screenshots, capture your screen at up to 4× resolution,
caption and search them, then export the batch as a ZIP.

**ទុក** is Khmer for "to keep" — which is exactly what it does.

## Features

- **Paste to add** — `Ctrl/⌘+V` anywhere on the page adds any image on your clipboard.
- **Drag & drop** — drop image files straight onto the page.
- **Screen capture, up to 4×** — grab your screen, a window, or a tab, rendered onto
  a canvas at 1×, 2×, or 4× the source resolution for a crisp, exportable PNG.
  `Ctrl/⌘+Shift+S` triggers it from anywhere.
- **Auto-copy to clipboard** — every capture can automatically land on your system
  clipboard too, ready to paste elsewhere. Toggle it off any time.
- **Paste-from-clipboard button** — a manual alternative to `Ctrl+V`, for when a
  keyboard shortcut isn't convenient.
- **Per-shot actions** — download as PNG, copy to clipboard, or delete, right from
  each card.
- **Captions & notes** — label every shot and jot context next to it; both are
  searchable.
- **Search & sort** — filter by caption/notes, sort by newest, oldest, largest file,
  or caption A–Z.
- **Bulk export** — select any subset and export as a ZIP, complete with a
  `captions-and-notes.txt` manifest.
- **Local-first storage** — screenshots are stored as native Blobs in IndexedDB
  (not bloated base64), split into metadata and image stores so editing a caption
  never rewrites the image.

## Tech stack

- Vanilla JavaScript (ES modules), no framework — small and fast
- [Vite](https://vitejs.dev) for dev server & bundling
- [JSZip](https://stuk.github.io/jszip/) for ZIP export
- IndexedDB for storage, `localStorage` for small UI settings only
- Browser-native `getDisplayMedia` and Clipboard APIs — zero backend

## Project structure

```
tuk/
├── index.html          # page shell + toolbar/dropzone/grid markup
├── public/
│   └── favicon.svg
└── src/
    ├── main.js          # app state, rendering, lightbox, event wiring
    ├── style.css         # all styling (design tokens at the top)
    ├── db.js              # IndexedDB persistence layer
    ├── capture.js          # getDisplayMedia capture + clipboard read/write
    ├── export.js            # ZIP export + single-file download
    ├── utils.js               # formatting/sort/filter helpers + inline icons
    └── toast.js                # toast notifications
test/
├── utils.test.js       # pure formatting/sort/filter helpers
└── export.test.js      # ZIP export contents + single-file download
```

## Development

```
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
npm run test     # run the vitest suite (utils + export logic)
npm run lint     # eslint
```

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs lint, tests, and
the build on every push and pull request against `main`.

## Browser support notes

- Screen capture (`getDisplayMedia`) and clipboard image read/write need a
  Chromium-based or recent Firefox/Safari browser, and a secure context
  (HTTPS or `localhost`).
- The 4× capture option **upscales** the captured pixels with high-quality
  smoothing for a sharper, larger export — it can't fabricate detail beyond
  what your display actually showed.
- All data stays on-device. Clearing site data / IndexedDB in your browser
  will remove everything Tuk has stored.

## License

MIT — see [LICENSE](./LICENSE).
