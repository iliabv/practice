---
name: test-changes
description: Use after making code changes to test in a real browser. Provides scoped test recipes per view, state seeding patterns, and API mocking to verify changes without a real Gemini API key.
allowed-tools: Bash(playwright-cli *), Bash(python3 *), Bash(lsof *)
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
3. Seed state and navigate (see presets below). `seed-state.py` calls playwright-cli internally, keeping special characters out of bash:
   ```bash
   python3 .claude/skills/test-changes/seed-state.py '<json>' text   # text|words|input
   ```
4. Add route mocks (after seed-state navigates — routes are lost on navigation):
   ```bash
   playwright-cli route "https://generativelanguage.googleapis.com/**" --body='{"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"audio/L16;rate=24000","data":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}}]}}]}'
   ```
5. Verify:
   ```bash
   playwright-cli snapshot
   playwright-cli console   # no error-level messages
   ```
6. Close:
   ```bash
   playwright-cli close
   ```

## State Seeding

State lives in localStorage under key `dutch-practice`. The browser must be open first. `seed-state.py` handles both seeding and navigation internally via subprocess calls to playwright-cli — this keeps special characters (`#`, `?`, `=`, base64) out of bash commands:

```bash
playwright-cli open http://localhost:8008
python3 .claude/skills/test-changes/seed-state.py '<json>' text
```

To re-navigate with the same state (e.g. after changing views), just call seed-state.py again — it re-seeds and navigates.

**Route mocks are lost on navigation** — always re-add them after seed-state.py navigates.

### State Presets

**Text view** (2 sentences):
```bash
python3 .claude/skills/test-changes/seed-state.py '{"apiKey":"fake","languageCode":"nl-NL","voiceName":"Zephyr","ttsModel":"gemini-2.5-flash-preview-tts","speed":"normal","texts":[{"id":"id1","text":"Zin één. Zin twee.","sentenceProgress":[{"loopCount":0},{"loopCount":0}],"createdAt":1700000000000}],"savedWords":[]}' text
```

**Words view** (1 saved word):
```bash
python3 .claude/skills/test-changes/seed-state.py '{"apiKey":"","languageCode":"nl-NL","voiceName":"Zephyr","ttsModel":"gemini-2.5-flash-preview-tts","speed":"normal","texts":[],"savedWords":[{"id":"w1","word":"huis","wordLower":"huis","sentence":"Dit is een groot huis.","translation":"house","infinitive":"huis","partOfSpeech":"noun","synonyms":["woning","verblijf"],"usage":"Common word for house or home","languageCode":"nl-NL","createdAt":1700000000000,"practices":[],"easeFactor":2.5,"interval":1,"nextDue":0}],"wordsSortMode":"recent"}' words
```

**Input view** (1 history entry):
```bash
python3 .claude/skills/test-changes/seed-state.py '{"apiKey":"","languageCode":"nl-NL","voiceName":"Zephyr","ttsModel":"gemini-2.5-flash-preview-tts","speed":"normal","texts":[{"id":"id1","text":"Zin één. Zin twee. Zin drie.","sentenceProgress":[{"loopCount":0},{"loopCount":0},{"loopCount":0}],"createdAt":1700000000000}],"savedWords":[]}' input
```

## Important: Command Structure

- **Never chain** playwright-cli or python3 commands with `&&` or `;` — chained commands won't match the permission allowlist and will prompt the user.
- Run each command as a **separate Bash call**. Use parallel tool calls for independent commands (e.g. `seed-state.py` and `lsof` can run in parallel).
- Sequential dependencies (e.g. `open` → `seed-state.py` → `route`) must be separate sequential Bash calls.
- **Never use `playwright-cli goto` or `playwright-cli open` with URLs containing `#` or `?`** — these characters trip permission safeguards. Always use `seed-state.py` for navigation with hash routes.
- **Avoid `eval`** — use `snapshot` to get element refs, then `click <ref>`. Eval with JavaScript code containing escaped quotes trips permission safeguards.

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

**History CRUD:** seed input-view state, then:
```bash
python3 .claude/skills/test-changes/seed-state.py '<input-view json>' input
playwright-cli snapshot            # verify history items rendered
playwright-cli click <delete-btn-ref>
playwright-cli dialog-accept
playwright-cli snapshot            # verify item removed
```

### Words View (`#/words`)

Seed words-view state, then:
```bash
python3 .claude/skills/test-changes/seed-state.py '<words-view json>' words
playwright-cli snapshot              # verify word card rendered
playwright-cli click <reveal-btn>    # the ? button
playwright-cli snapshot              # verify answer visible, thumb buttons
playwright-cli click <thumb-up-ref>
playwright-cli snapshot              # verify green highlight
playwright-cli click <sort-due-btn>
playwright-cli snapshot              # verify sort mode changed
```

### Text View (`#/text?id=...`)

Seed text-view state, then:
```bash
python3 .claude/skills/test-changes/seed-state.py '<text-view json>' text
playwright-cli route "https://generativelanguage.googleapis.com/**" --body='{"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"audio/L16;rate=24000","data":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}}]}}]}'
playwright-cli snapshot              # verify sentences rendered
# Click a sentence — use ref from snapshot output
playwright-cli click <sentence-ref>
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
