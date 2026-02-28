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

A vanilla JavaScript web application for language pronunciation practice. Supports any language available in ElevenLabs TTS (auto-detect by default). Single-page app with no build system, bundler, or framework — pure HTML/CSS/ES6 modules that run directly in the browser.

## Development

**No build step, no package manager, no test framework.**

To run locally (HTTP server required for ES modules):
```bash
python3 -m http.server 8000
```
Then open `http://localhost:8000`. Testing is manual in the browser.

Requires an ElevenLabs API key and microphone access for full functionality.

## Architecture

### Module Structure (`/js/`)

- **`main.js`** — Orchestration, event listeners, practice loop lifecycle, keyboard shortcuts (Space/Arrow keys/Enter/Backspace)
- **`state.js`** — Centralized state with getter/setter pattern; persistent fields auto-save to localStorage (key: `'dutch-practice'`)
- **`ui.js`** — DOM manipulation, view switching (input ↔ practice), sentence rendering with color coding by loop count
- **`elevenlabs.js`** — ElevenLabs TTS API v1 integration with Cache API (persistent across reloads); exports `VOICES`, `LANGUAGES`, `textToSpeech`; model `eleven_multilingual_v2`; voice, speed, and language are configurable; cache key includes all settings so no manual invalidation needed
- **`recorder.js`** — Web Audio MediaRecorder wrapper, returns Promise resolving to audio Blob
- **`audio-utils.js`** — Audio playback (`playBlob`, `playBeep`, `stopPlayback`) with settled-flag race condition prevention
- **`sentence-parser.js`** — Splits text on sentence boundaries using lookbehind regex

### Practice Loop Flow

1. Play original sentence (TTS) → 2. Start beep → 3. Record user speech → 4. End beep → 5. Play recording back → 6. Play original again → 7. Increment loop count

### Conventions

- CSS variables for theming (`--bg`, `--surface`, `--text`, etc.)
- `.hidden` class for view toggling
- kebab-case for DOM IDs and CSS classes, camelCase for JS
- No external dependencies — browser APIs only (Web Audio, MediaRecorder, localStorage, Cache API) plus ElevenLabs REST API