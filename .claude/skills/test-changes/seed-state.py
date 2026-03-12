#!/usr/bin/env python3
"""Encode JSON state as a base64 URL param for browser testing.

Usage: python3 seed-state.py '<json>'
Output: http://localhost:8008?state=<base64>
"""

import base64, json, sys

if len(sys.argv) < 2:
    print("Usage: seed-state.py '<json>'", file=sys.stderr)
    sys.exit(1)

state = json.loads(sys.argv[1])
encoded = base64.b64encode(json.dumps(state).encode()).decode()
print(f"http://localhost:8008?state={encoded}")
