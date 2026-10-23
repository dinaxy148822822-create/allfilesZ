# Contributing to allfilesZ

Thanks for your interest! 🎉

## Dev setup

```bash
npm ci
npm start     # run the app
npm test      # engine tests — must pass on all platforms
npm run demo  # UI preview in a browser (mocked engines)
```

## Adding a language

1. Copy `src/renderer/i18n/en.json` → `src/renderer/i18n/<code>.json` (BCP-47, e.g. `pt-BR.json`).
2. Translate every value. Keep `{placeholders}` intact. Set `meta.name` to the native
   language name and `meta.dir` to `"rtl"` for RTL scripts.
3. That's it — the language appears automatically in the UI and the CI completeness check.

## Adding a format

Conversion logic lives in `src/main/converter.js` (images via sharp, media via ffmpeg args)
and the format lists at the top of the file plus `formatGroups()` in
`src/renderer/js/app.js`. Add an engine test in `tests/engines.test.js`.

## Guidelines

- Keep the app 100 % offline — no network calls, no telemetry.
- Renderer stays sandboxed: features go through the preload bridge, never direct `require`.
- Run `npm test` and make sure i18n keys are complete before opening a PR.
