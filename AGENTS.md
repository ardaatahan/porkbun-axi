# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- `README.md` is the authoritative command and safety-gate reference. Keep it aligned with command specs in `src/commands/porkbun.ts`.
- Validate changes with `npm test`, `npm run skill:check`, and `axi-axi validate "node bin/porkbun-axi.js" --dir . --strict --timeout 30000`.
- Tests must mock HTTP. Live Porkbun calls require separately supplied credentials and are never part of the automated suite.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
