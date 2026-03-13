## Rules For All Code Changes
1. Aim for simplicity — abstractions are OK only when they simplify the logic
2. Prefer linear flow
3. Avoid unnecessary repetition
4. Clean up unused code
5. Always update CLAUDE.md if new changes make parts of it outdated
6. Always use the `/test-changes` skill after code changes; update the skill if changes add new UI elements, views, interactions, or API endpoints

## Project Overview

A vanilla JavaScript web application for language pronunciation practice. Uses Gemini TTS for speech synthesis. Single-page app with no build system, bundler, or framework — pure HTML/CSS/ES6 modules that run directly in the browser.

## Architecture

### Module Structure (`/js/`)

- **`main.js`** — Orchestrator: creates views, handles routing (`navigate(route)`), settings listeners, hashchange. Resumes last active view on load via `state.lastHash`.
- **`state.js`** — Centralized state with getter/setter pattern; persistent fields auto-save to localStorage.
- **`ui.js`** — Shared DOM utilities: element cache (`els`), banners, confirmations, formatting helpers.
- **`views/main-view.js`** — Input view: text entry, history list.
- **`views/text-view.js`** — Text view: sentence rendering, inline player, practice loop, play-all, word interaction/popup, keyboard shortcuts.
- **`views/words-view.js`** — Words view: cloze/gap-fill cards with sort controls.
- **`tts.js`** — Gemini TTS (`generateContent` with `responseModalities:["AUDIO"]`). Exports hardcoded `VOICES`, `MODELS` (flash/pro), `SPEEDS` (slow/normal/fast). Base64 PCM response wrapped in WAV header. Cache API caching with key `model:voice:speed:lang:text`.
- **`recorder.js`** — MediaRecorder wrapper, returns audio Blob.
- **`audio-utils.js`** — Audio playback with race condition prevention.
- **`sentence-parser.js`** — Splits text on sentence boundaries.
- **`translate.js`** — Google Cloud Translation API with Cache API caching.
- **`spaced-repetition.js`** — SM-2 variant algorithm for word practice ordering.

### View Module Pattern

Each view exports a factory receiving dependencies (`state`, `els`, `ui`) and returning `{ enter(route), leave() }`. Views don't import main.js or know about each other. `main.js` handles transitions: leave active view → enter new one, with fallback to input view on error.

### Text Practice Loop Flow

1. Play original sentence (TTS) → 2. Await user record press → 3. Record user speech → 4. Play recording back → 5. Play original again → 6. Increment loop count

### Word Practice Flow

1. Click active sentence word → popup with translation (Google Translate API) + Save button
2. Saved words persist in `state.savedWords` with TTS settings snapshot
3. `#/words` view shows cloze/gap-fill cards sorted by recent or smart (spaced repetition)
4. Type answer → green (correct) / red (incorrect) + SR fields updated

### Conventions

- CSS variables for theming (`--bg`, `--surface`, `--text`, etc.)
- `.hidden` class for view toggling
- kebab-case for DOM IDs and CSS classes, camelCase for JS
- No external dependencies — browser APIs only (Web Audio, MediaRecorder, localStorage, Cache API) plus Gemini TTS and Google Cloud Translation REST APIs
- Hash-based routing: `#/` (input), `#/text?id=...` (text), `#/words` (word practice)