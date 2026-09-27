# Port and upstream-sync guide

This document records how this standalone extension (the repository root `.`) was derived from `howaboua-pi-stuff/packages/pi-codex-conversion`, and how to merge future changes without importing Codex-specific behavior. The donor checkout under `howaboua-pi-stuff/` is a **reference**, not a package dependency or part of the published extension. In path examples below, `S=howaboua-pi-stuff/packages/pi-codex-conversion` and `D=.` when run from this repository root. The sync commands explicitly enter the donor checkout and then use `S=packages/pi-codex-conversion` and `D=..` (the standalone repository root).

## Baseline and boundary

- Initial donor: `S/package.json` version **3.0.39**, monorepo commit **`61b493cf76cdd8e4789dd08d3a0ecee6c1c7c6eb`**. This is the comparison base for the *first* subsequent sync; advance it here only after merging and testing. The upstream source in `S/code-mode/vendor/code-mode-src/` was pinned to Codex `rust-v0.145.0` / commit `25af12f7e61572b0bc18ddb1008be543b91519b0` (`S/code-mode/UPSTREAM_SYNC.md`). The host asset release in `D/src/tools/code-mode/host-assets.ts` is `rust-v0.145.0`; Deno in `D/src/tools/notebook-mode/deno-assets.ts` is `2.9.7`. Check these values again at every sync; they are *not* a promise to follow every donor release.
- The donor provides the execution engine; the standalone package owns activation, the nested Pi tool provider, configuration, prompts, cache/state namespace, and packaging. **Do not overwrite `D/src/index.ts`, `D/src/mode.ts`, or `D/src/provider.ts` with donor activation code.**
- One mode extension at a time: both packages register top-level `exec`, `wait`, and `notebook`. Do not install them together without designing a tool-name coexistence scheme.

## Inventory: what was copied

| Donor | Destination | Scope / cautions |
| --- | --- | --- |
| `S/src/tools/code-mode/*.ts` | `D/src/tools/code-mode/*.ts` | All runtime, host transport, protocol, delegation, bounded output, rendering, prompts, hooks, TOML-support implementation, and public-tool code, **except** `notebook-rendering.ts` (see below). Keep these files together: `public-tools.ts` alone does not implement Code mode. |
| `S/src/tools/notebook-mode/*.ts` | `D/src/tools/notebook-mode/*.ts` | Entire Notebook runtime: client, Jupyter/bridge, Deno installer, kernel/execution/session/lifecycle, checkpoints, journal, project state, profiles, recovery, diagnostics. None of these subsystems is a disposable Codex UI add-on. `shared-runtime.ts` lazy-imports `../notebook-mode/client.ts`. |
| `S/src/tools/tool-sampling.ts` | `D/src/tools/tool-sampling.ts` | Experimental constrained sampling for `wait`/`notebook`; the donor's other tool names in its set are inert here. |
| `S/code-mode/vendor/code-mode-src/{Cargo.toml,Cargo.lock,LICENSE,NOTICE,UPSTREAM,crates/}` | same paths under `D/` | Pinned host source plus licence/notice/provenance; see `S/code-mode/UPSTREAM_SYNC.md`. `D/package.json` publishes the notice files, not the Rust source; `D` can build the host locally with `npm run build:code-mode-host`. Do not change asset URLs, release, digest or extraction logic merely to rename the upstream `codex-code-mode-host` binary. |
| `S/LICENSE`, `S/tsconfig.json`, `S/tsconfig.build.json` | corresponding files under `D/` | `tsconfig.build.json` disables declarations; `tsconfig.json` inlines the donor's `tsconfig.base.json` compiler options so this repository builds independently, without extending a file in the donor checkout. |

**Not copied:** `S/src/tools/{exec/,apply-patch/,view-image/,native/,rust/}` and their binaries; `S/src/adapter/` (notably `adapter/code-mode.ts`, `adapter/code-mode/nested-tool-adapter.ts`, `adapter/activation/`); `S/src/extension/`, `S/src/providers/`, `S/src/index.ts`, `S/src/code-mode.ts`, `S/src/code-mode-extension-tools.ts`, `S/src/code-mode-hooks.ts`, `S/src/code-mode-preflight.ts`, `S/src/context-management/`, `S/src/prompt/`, `S/src/ui/`, `S/src/voice/`, request rewriting, Responses Lite, native compaction, settings UI, and usage/quota functionality. Nor were the donor's scripts, examples, or test suite copied wholesale. `S/src/ui/tool-rendering/auxiliary-tool.ts` is not part of this package.

The donor's `S/src/tools/code-mode/{AGENTS.md,CUSTOM-TOOLS.md,notebook-rendering.ts}` and `S/src/tools/notebook-mode/AGENTS.md` were **not retained**. `notebook-rendering.ts` depends on the donor's UI renderer. TOML discovery/runner source remains in the copied runtime, but `D/src/index.ts` does **not** call `registerCustomTools()`; there is no enabled TOML UI or documentation file in this package. `D/src/tools/code-mode/tools.ts` still exports the dormant `registerCustomTools()` path, whose `customToolsDocumentationPath()` refers to that absent file. If enabling TOML tools later, add and maintain new local docs and tests first. Likewise, extension-tool adaptation is not enabled; the shared nested preflight/completion mechanics remain in the runtime.

## Local files and integration (do not replace from donor)

- `D/src/index.ts`: `pi` entry point, `/mode` command/picker, global `pi-notebook-mode.json` (`mode`, `maxHeapMiB`, optional `profile`), startup/model/input tool reconciliation, first Notebook-turn status, short `before_agent_start` guidance, checkpoint before compaction, shutdown. Defaults to `off`; no Codex provider or provider transport override.
- `D/src/mode.ts`: `ModeSwitch` selects `exec,wait` in Code mode, adds `notebook` in Notebook mode, saves/restores normal Pi tools and reconciles other extensions' additions/removals.
- `D/src/provider.ts`: adapts **Pi's own** read/bash/edit/write/grep/find/ls factories to the runtime's `ProgrammaticCodeModeToolDefinition`, with argument validation, cancellation, image-value conversion, and nested trace capture. It does not use Codex `exec_command`, `write_stdin`, `apply_patch`, or `view_image`. When Pi updates tool parameter schemas, update the short `usage` lines here.
- `D/package.json`, `D/tsconfig*.json`, `D/.gitignore`, `D/README.md`, `D/tests/mode.test.ts`: standalone root-level package/dependencies, build and smoke tests. Build uses `tsc` with `declaration: false` and cleans `dist`; `prepack` runs typecheck/test/build. `D/tsconfig.json` contains its own compiler options (no path into the donor repo). The root `.gitignore` ignores the donor checkout, `dist`, `node_modules`, and Rust build output. Published files are the JS `dist`, README, this guide, licence and V8 notices. Sync package dependencies only for imports actually needed by this runtime (`smol-toml`, `ws`, `undici`, `proxy-from-env`, Pi/TypeBox peers).

## Intentional differences within the copied runtime

Reapply or preserve these when merging donor changes (not an instruction to blindly search/replace every use of "codex": upstream binary/asset names and the `codex/imageDetail` metadata key are protocol names):

| Destination file(s) | Standalone change and why |
| --- | --- |
| `code-mode/tools.ts` | Process registration symbol `@howaboua/pi-notebook-mode.code-mode`; do not share runtime/providers with Codex conversion. The dormant custom-tool paths are **not** wired by `index.ts`. |
| `code-mode/custom-tool-prompt.ts` | Prompt section tag `notebook_mode_tools`, not `codex_tools`. Keep the useful short promoted-tool usage and deferred `ALL_TOOLS` behavior; do not copy Codex shell/patch prompt text. |
| `code-mode/preflight-protocol.ts` | Event protocol namespace `@howaboua/pi-notebook-mode/code-mode-preflight/v1`; avoid crossing extension hooks. |
| `code-mode/custom-tools.ts` | Dormant custom-tool directory name `notebook-mode-custom-tools`; not the Codex directory. |
| `code-mode/binary.ts`, `code-mode/install-host.ts` | Cache under `cache/pi-notebook-mode/code-mode/`; unique `pi-notebook-code-mode-` temp prefix; binary build error names `npm run build:code-mode-host`. **Keep** pinned host names, upstream URL and SHA-256 verification in `host-assets.ts`/installer. |
| `code-mode/public-tools.ts` | Removed Codex-specific numeric `cell_id` fallback to `write_stdin` / `exec_command` sessions (`continueExecSessionFromMistakenWait`) and its imports. Normal `wait` and adaptive wait remain. Do not reintroduce that fallback. |
| `code-mode/notebook-tool.ts` | Removed spread of `notebookRenderers` and import of `notebook-rendering.ts` because its donor UI dependency is absent. Notebook control actions and proxy remain. |
| `code-mode/tool-events.ts` | Removed eager `runtime.prepare(ctx)` in `before_agent_start`; `index.ts` handles Notebook first-turn status; actual client stays lazy until needed. Shared prompt preparation and script-error marking remain. |
| `notebook-mode/checkpoint.ts`, `deno-binary.ts`, `journal.ts`, `profile-state-format.ts`, `project-state-format.ts` | Independent notebook/cache paths under `cache/pi-notebook-mode/`; keep checksum-validated Deno installation. |
| `notebook-mode/session-identity.ts` | Pi session tree epoch key `pi-notebook-mode-notebook-tree-epoch`; do not reuse Codex state entries. |
| `notebook-mode/jupyter-connection.ts`, `jupyter-wire.ts` | Unique `pi-notebook-deno-kernel-` temp prefix and Jupyter username `pi-notebook-mode`. |

The rest of the TS runtime was initially copied unmodified. If an upstream change touches an otherwise identical file, merge that file **and** inspect its imports and callers in both runtime directories. If it touches a file above, merge the behavior while retaining the local differences.

## Repeatable future-sync procedure

1. Work in a branch. Record the current donor commit and versions from `S/package.json`, `S/src/tools/code-mode/host-assets.ts`, `S/src/tools/notebook-mode/deno-assets.ts`, `S/code-mode/UPSTREAM_SYNC.md`. Use the baseline commit at the top of this guide (or the most recently updated baseline) as the **merge base**. Confirm the donor working tree is clean; do not mistake local donor edits for upstream releases. Review the change list, including new/deleted files:

   ```sh
   cd howaboua-pi-stuff # from the standalone repository root
   BASE=61b493cf76cdd8e4789dd08d3a0ecee6c1c7c6eb # replace after each successful sync
   S=packages/pi-codex-conversion
   D=.. # standalone repository root, outside the donor checkout
   git diff --name-status "$BASE" HEAD -- "$S/src/tools/code-mode" "$S/src/tools/notebook-mode" "$S/src/tools/tool-sampling.ts" "$S/code-mode/vendor/code-mode-src" "$S/code-mode/UPSTREAM_SYNC.md"
   diff -rq "$S/src/tools/code-mode" "$D/src/tools/code-mode" || true
   diff -rq "$S/src/tools/notebook-mode" "$D/src/tools/notebook-mode" || true
   ```

   For an individual changed file, use `git show "$BASE:$S/src/tools/code-mode/FILE.ts"` (base), the current donor file (theirs), and `D/src/tools/code-mode/FILE.ts` (ours) for a three-way comparison; similarly for Notebook files. The `diff -rq` output **always** includes the intentional differences table above; it is not itself a list of regressions. If the base commit is unavailable, manually review the entire donor/local diff rather than copying whole directories.

2. Merge runtime changes **as a connected unit**: start with changed `code-mode/{types,host-protocol,shared-runtime,delegate-runtime,host-client,public-tools,notebook-tool}.ts`, then their imported modules and `notebook-mode/` counterparts. Add new runtime files only after checking imports outside the boundary. For deletions, verify the destination has no remaining references. Keep `shared-runtime.ts`'s lazy Notebook import. Reapply the table above for modified files; retain the independent config/cache/state/event names and the absence of numeric `wait` fallback and donor UI rendering. Do not replace `index.ts`, `mode.ts`, `provider.ts` or local package metadata with Codex activation. Avoid bulk global substitutions of `codex` because binary asset and protocol identifiers can be fixed upstream contracts.

3. If the donor changes the host or Deno pin: update the relevant `host-assets.ts` / `deno-assets.ts` **together with verified platform digests, sizes, URLs and installer/extraction compatibility**. Sync `code-mode/vendor/code-mode-src/` (including Cargo lock, licence/notice/provenance) as a unit when the host source changes; consult the donor's `code-mode/UPSTREAM_SYNC.md`. Check npm `files` still ships required legal notices. Never remove checksum checks to make a new download work. Review new runtime dependencies in `S/package.json` by inspecting imports; add only needed dependencies to `D/package.json`.

4. Review *integration* changes separately: donor activation/nested adapter/prompt changes are design input, not files to copy. Map generic feature needs to `D/src/index.ts`, `D/src/mode.ts`, `D/src/provider.ts` and `D/src/tools/code-mode/tool-events.ts`; leave provider/request rewrites, Codex tool families, settings UI, quota, and context management out. Keep prompts short and mode-specific. If intentionally adding an optional integration (TOML, extension tools, custom notebook renderer), give it a separate interface, documentation and tests.

5. Update tests for newly merged behavior. Useful donor tests to **adapt, not blindly copy** include `S/tests/code-mode-{delegate-cancellation,host-protocol,preflight,tool-exposition}.test.ts` and `S/tests/notebook-{exec-bridge,checkpoint-state,journal,recovery,profile-state,project-state,lifecycle-runtime}.test.ts`; strip donor activation/provider fixtures. Add local tests for config/mode restoration and cache/identity isolation whenever those contracts change. Verify from `D/`:

   ```sh
   npm run typecheck
   npm test
   npm run build
   npm pack --dry-run
   ```

   On a supported host, also manually exercise `/mode code` (`exec` -> nested Pi read/bash -> `wait`), `/mode notebook` (retained binding, `notebook status`/checkpoint, restart/recovery/journal), `/mode off` (original tools restored), compaction, and another extension changing active tools. Download tests must confirm checksum rejection as well as success. These live-runtime checks were **not** performed in the initial port; typecheck, local tests, build and package dry-run were.

6. Inspect `git diff` for paths/names leaking from Codex, unreviewed donor modules, generated output, and legal files. Update this guide's baseline commit/version, pins, differences table, inventory and test status **only after** the merge passes. Document any intentionally postponed upstream changes so the next sync can distinguish them from omissions.
