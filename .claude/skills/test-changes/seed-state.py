#!/usr/bin/env python3
"""Seed browser localStorage with test state and navigate.

Usage: python3 seed-state.py '<json>' [view]
  - Sets localStorage 'dutch-practice' to <json> via playwright-cli
  - view: 'text' | 'words' | 'input' (default: no navigation)
  - Injects lastHash into state and reloads the page to pick up changes
  - Browser must already be open via: playwright-cli open http://localhost:8008
"""

import json, subprocess, sys

if len(sys.argv) < 2:
    print("Usage: seed-state.py '<json>' [text|words|input]", file=sys.stderr)
    sys.exit(1)

state = json.loads(sys.argv[1])

# Inject lastHash so the app navigates to the right view on reload
if len(sys.argv) >= 3:
    view = sys.argv[2]
    if view == 'text':
        text_id = state.get('texts', [{}])[0].get('id', 'id1')
        hash_route = f'#/text?id={text_id}'
    elif view == 'words':
        hash_route = '#/words'
    elif view == 'input':
        hash_route = '#/'
    else:
        print(f"Unknown view: {view}. Use text|words|input", file=sys.stderr)
        sys.exit(1)
    state['lastHash'] = hash_route
    state['lastTextHash'] = hash_route if view == 'text' else state.get('lastTextHash')

compact = json.dumps(state, separators=(',', ':'))

# Set localStorage
result = subprocess.run(
    ['playwright-cli', 'localstorage-set', 'dutch-practice', compact],
    capture_output=True, text=True,
)
if result.returncode != 0:
    print(result.stderr, end='', file=sys.stderr)
    sys.exit(result.returncode)

# Reload to pick up new state (goto with hash-only change won't trigger full reload)
if len(sys.argv) >= 3:
    result = subprocess.run(
        ['playwright-cli', 'reload'],
        capture_output=True, text=True,
    )
    if result.stdout:
        print(result.stdout, end='')
    if result.returncode != 0:
        print(result.stderr, end='', file=sys.stderr)
        sys.exit(result.returncode)
