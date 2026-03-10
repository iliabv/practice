---
name: test-changes
description: Use after making code changes to test in a real browser. Provides scoped test recipes per view, state seeding patterns, and API mocking to verify changes without a real Google Cloud API key.
allowed-tools: Bash(playwright-cli:*), Bash(python3:*)
---

# Test Changes

## Core Workflow

1. Start server (skip if already running):
   ```bash
   python3 -m http.server 8008  # run_in_background=true
   ```
2. Open browser:
   ```bash
   playwright-cli open http://localhost:8008
   ```
3. Run the test recipe for affected view(s) — see below
4. Check for errors:
   ```bash
   playwright-cli console
   ```
   Verify no error-level messages in output.
5. Close:
   ```bash
   playwright-cli close
   ```

## State Seeding

All app state lives in localStorage key `dutch-practice`. Seed it to skip needing a real API key:

```bash
playwright-cli localstorage-set dutch-practice '{"apiKey":"","languageCode":"nl-NL","voiceName":"","speed":1,"texts":[{"id":"id1","text":"Zin één. Zin twee. Zin drie.","sentenceProgress":[{"loopCount":0},{"loopCount":0},{"loopCount":0}],"createdAt":1700000000000}],"savedWords":[]}'
playwright-cli reload
```

After seeding, always `reload` so the app picks up the new state.

## Element Refs

Playwright-cli assigns numeric refs (e.g. `e5`, `e12`) to elements in snapshot output. Always run `snapshot` first, find the target element in the output, then use its ref in subsequent commands.

## Per-View Recipes

### Input View (`#/`)

**Basic — no API key validation:**
```bash
playwright-cli snapshot
# Find the textarea ref and start button ref in output
playwright-cli fill <textarea-ref> "Test zin."
playwright-cli click <start-btn-ref>
playwright-cli snapshot   # should show API key banner
```

**History CRUD (seed state first):**
```bash
playwright-cli snapshot            # verify history items rendered
playwright-cli click <delete-btn-ref>
playwright-cli dialog-accept
playwright-cli snapshot            # verify item removed
```

### Words View (`#/words`)

Seed with saved words:
```bash
playwright-cli localstorage-set dutch-practice '{"apiKey":"","languageCode":"nl-NL","voiceName":"","speed":1,"texts":[],"savedWords":[{"id":"w1","word":"test","wordLower":"test","sentence":"Dit is een test zin.","translation":"This is a test sentence.","languageCode":"nl-NL","voiceName":"","speed":1,"createdAt":1700000000000,"practices":[],"easeFactor":2.5,"interval":1,"nextDue":0}]}'
playwright-cli goto http://localhost:8008/#/words
playwright-cli snapshot              # verify word card rendered
playwright-cli click <reveal-btn>    # the ? button
playwright-cli snapshot              # verify answer visible, thumb buttons
playwright-cli click <thumb-up-ref>
playwright-cli snapshot              # verify green highlight
playwright-cli click <sort-due-btn>
playwright-cli snapshot              # verify sort mode changed
```

### Text View (`#/text?id=...`)

Mock TTS API + seed state:
```bash
playwright-cli route "https://texttospeech.googleapis.com/**" --body='{"audioContent":"UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGFO"}'
playwright-cli localstorage-set dutch-practice '{"apiKey":"fake","languageCode":"nl-NL","voiceName":"nl-NL-Standard-A","speed":1,"texts":[{"id":"id1","text":"Zin één. Zin twee.","sentenceProgress":[{"loopCount":0},{"loopCount":0}],"createdAt":1700000000000}],"savedWords":[]}'
playwright-cli goto "http://localhost:8008/#/text?id=id1"
playwright-cli snapshot              # verify sentences rendered
playwright-cli click <sentence-ref>  # click a sentence
playwright-cli snapshot              # verify inline-player visible
playwright-cli press Escape
playwright-cli snapshot              # verify inline-player closed
playwright-cli console               # check for errors
```

## Scope Guide

| File changed | Test |
|---|---|
| `js/views/main-view.js` | Input view: textarea, start-btn validation, history CRUD |
| `js/views/text-view.js` | Text view: sentence render, inline-player, keyboard nav |
| `js/views/words-view.js` | Words view: cards, reveal, thumb buttons, sort |
| `js/tts.js` | Mock TTS route, test loading/error states in text view |
| `js/translate.js` | Mock Translation route, test word popup in text view |
| `js/state.js` | Seed localStorage, reload, verify state-driven rendering |
| `js/spaced-repetition.js` | Seed words with SR fields, check sort-due ordering |
| `js/main.js` | Navigation between all 3 views, settings persistence |
| `index.html` / CSS | Screenshot before/after for visual comparison |

## Verification Checklist

After every change:
1. `console` — no error-level messages
2. Affected view renders correctly (`snapshot` or `screenshot`)
3. Primary interaction works (fill/click → verify via snapshot)
4. Navigation between views still works
5. Error banner shows/hides correctly
