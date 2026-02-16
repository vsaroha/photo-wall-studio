#!/usr/bin/env bash
set -euo pipefail

node --check state.js
node --check layout.js
node --check render.js
node --check interact.js
node --check export.js

node --test tests/*.test.js
