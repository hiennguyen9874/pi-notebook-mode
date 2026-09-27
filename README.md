# pi-notebook-mode

Standalone Code and Notebook modes for Pi. This repository root is the extension package; `howaboua-pi-stuff/` is only a reference donor checkout and is not needed to install or build. Install this root as a Pi extension, then run `/mode code`, `/mode notebook`, or `/mode off` (or `/mode` for a picker). Defaults to off. Uses Pi's normal model transport and Pi's read/bash/edit/write/grep/find/ls implementations inside `tools.*`; it does not install a Codex provider or shell/patch adapters.

In both modes, the nested `tools.edit` takes one exact replacement per call: `tools.edit({ path, oldText, newText })`. Call it again for another replacement; the underlying file operation remains Pi's edit tool.

Code mode runs isolated, restricted JavaScript cells through the pinned V8 host. Notebook mode runs persistent Deno/TypeScript cells with imports, profiles, journal, recovery, checkpoints and the `notebook` control tool. Both expose `exec` and `wait`. The first Notebook turn reports notebook status; compaction checkpoints the notebook.

Configuration is stored at `$PI_CODING_AGENT_DIR/pi-notebook-mode.json` (or Pi's default agent directory): `{ "mode": "off", "maxHeapMiB": 1024, "profile": "optional-profile" }`. A project's `.pi/pi-notebook-mode.json` can override any of these fields; omitted or invalid fields fall back to global settings. `/mode` saves to the project config if it exists, otherwise to the global config. Downloads of the pinned host and Deno are verified by SHA-256 and stored under the agent directory's `cache/pi-notebook-mode/`. Notebook state/journals/profiles also use that namespace. The upstream V8 host assets retain their upstream names; its licence, notice and provenance are under `code-mode/vendor/code-mode-src/`.

Requires Node 22.19+. Install **either** this extension **or** pi-codex-conversion: both register `exec`, `wait`, and `notebook`. TOML custom tools and third-party nested tool adapters are not enabled in this initial release.

For the source inventory, intentional differences from pi-codex-conversion, and a step-by-step future merge procedure, see [PORTING_SYNC.md](./PORTING_SYNC.md).

Run `npm run typecheck && npm test && npm run build` in this package to verify the extension.
