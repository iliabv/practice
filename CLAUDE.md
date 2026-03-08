# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## General Rules For Code Changes
1. Aim for simplicity, don't add unnecessary abstractions
2. Abstractions that simplify the logic are OK
3. Prefer linear flow
4. Avoid unnecessary repetition
5. Clean up unsused code
6. ALWAYS update CLAUDE.md file if the new changes make parts of it outdated

## Project Overview

A vanilla JavaScript web application for language pronunciation practice. Supports any language available in Google Cloud TTS. Single-page app with no build system, bundler, or framework — pure HTML/CSS/ES6 modules that run directly in the browser.

## Development

**No build step, no package manager, no test framework.**

To run locally (HTTP server required for ES modules):
```bash
python3 -m http.server 8000
```
Then open `http://localhost:8000`. Testing is manual in the browser.

Requires a Google Cloud API key (with Text-to-Speech and Cloud Translation APIs enabled) and microphone access for full functionality.

## Architecture

### Module Structure (`/js/`)

- **`main.js`** — Slim orchestrator: unified `navigate(route)` function with `activeView` tracking, routing (`setHash`, `getRouteFromHash`, `textHash`), `init()`, settings listeners (api-key, voice, language, speed), `refreshVoices()`, hashchange listener. On init, resumes last active non-input view via `state.lastHash`. Creates all 3 views and wires routing between them.
- **`state.js`** — Centralized state with getter/setter pattern; persistent fields auto-save to localStorage (key: `'dutch-practice'`). Includes `lastHash` for resuming the last active view on page load.
- **`ui.js`** — Shared utilities only: `els` (DOM reference cache), `showBanner`, `hideBanner`, `confirmDelete`, `loopColor`, `setActiveNav`, `escapeHtml`, `formatTime`
- **`views/main-view.js`** — Input view: history list rendering, start button handler, textarea Enter stopPropagation. Factory: `createMainView({ state, els, ui, textHash, onStartText })` → `{ enter(route), leave() }`
- **`views/text-view.js`** — Text view: sentence rendering, inline player, practice loop, play-all, word interaction/popup, keyboard shortcuts, mousedown dismiss handler. Imports `parseSentences` to validate text on entry. Factory: `createTextView({ state, els, ui })` → `{ enter(route), leave() }`
- **`views/words-view.js`** — Words view: cloze/gap-fill card rendering, sort controls. Factory: `createWordsView({ state, els, ui })` → `{ enter(route), leave() }`
- **`tts.js`** — Google Cloud TTS API integration with Cache API (persistent across reloads); exports `fetchVoices`, `LANGUAGES`, `textToSpeech`, `textToSpeechWithTimestamps`; voice names fetched dynamically per language; uses v1 for standard TTS and v1beta1 for SSML mark timepoints; cache key includes all settings so no manual invalidation needed
- **`recorder.js`** — Web Audio MediaRecorder wrapper, returns Promise resolving to audio Blob
- **`audio-utils.js`** — Audio playback (`playBlob`, `stopPlayback`) with settled-flag race condition prevention
- **`sentence-parser.js`** — Splits text on sentence boundaries using lookbehind regex
- **`translate.js`** — Google Cloud Translation API wrapper with Cache API caching (cache name: `'google-translate-cache'`); exports `translateText(text, apiKey, sourceLanguage)`
- **`spaced-repetition.js`** — SM-2 variant spaced repetition algorithm; exports `updateSR(word, correct)` and `smartSort(words)`

### View Module Pattern

Each view in `views/` exports a factory function returning `{ enter(route), leave() }`. All `enter` methods accept a route object `{ view, textId }` for a uniform interface. The factory receives dependencies (`state`, `els`, shared UI utils from `ui.js`) so views don't import main.js or know about each other. `leave()` only cleans up — the unified `navigate(route)` in main.js handles leaving the active view and entering the new one, with try/catch fallback to input view. Keyboard/mousedown listeners are registered once by text-view, gated by internal `active` flag.

### Practice Loop Flow

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
- No external dependencies — browser APIs only (Web Audio, MediaRecorder, localStorage, Cache API) plus Google Cloud TTS and Translation REST APIs
- Hash-based routing: `#/` (input), `#/text?id=...` (text), `#/words` (word practice)