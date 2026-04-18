---
name: embedded-build-size
description: "Analyze embedded ELF size with puncover + toolchain utilities, then produce prioritized reduction recommendations with evidence"
---

Use this skill to inspect firmware/application build size and produce concrete size-reduction recommendations.

## When to use

Use this skill when asked to:
- reduce flash/code size (`.text`, `.rodata`)
- reduce static RAM usage (`.data`, `.bss`)
- explain where size is coming from (functions/files/symbols)
- compare build size before/after a change

## Inputs to collect first

- Path to ELF/shared object output (required)
- Toolchain prefix path for binutils (required)
  - Example: `/path/to/arm-none-eabi-`
- Source root (optional, improves file paths)
- Build dir containing `.su` files (optional, enables stack data)

If any required input is unknown, ask the user.

## Procedure

1. **Build (if needed)**
   - Ensure the target is freshly built before analysis.

2. **Collect section-level baseline (fast)**
   - Run: `<tool-prefix>size -A <elf>`
   - Capture major sections (`.text`, `.rodata`, `.data`, `.bss`, and debug sections).

3. **Collect symbol/file breakdown (machine-readable)**
   - Run from this skill folder:

```bash
uv run --with puncover python ./puncover_export.py \
  --elf <elf> \
  --gcc-tools-base <tool-prefix> \
  --src-root <src-root> \
  --build-dir <build-dir> \
  --top 40 \
  --out <report.json>
```

4. **(Optional) Human inspection in UI**
   - Launch puncover UI:

```bash
uvx puncover --gcc-tools-base <tool-prefix> --elf <elf> --src-root <src-root> --build-dir <build-dir> --no-open-browser
```

5. **Generate recommendations**
   - Use the JSON report as evidence.
   - Prioritize by potential byte savings and implementation risk.

## Recommendation rubric

Always include:
- **Finding** (what is large)
- **Evidence** (exact function/file/section + byte counts)
- **Recommendation** (actionable change)
- **Expected impact** (rough bytes saved range)
- **Risk** (low/medium/high)

Heuristics:

- Large constructors/static init (`__static_initialization_and_destruction_0`, global objects):
  - Move heavy initialization to runtime path or lazy init.
  - Prefer POD/static tables over complex global objects.

- Heavy formatting/stdio symbols (`_svfprintf_r`, `_dtoa_r`, printf-family):
  - Remove floating-point printf.
  - Replace `printf` with lighter logging / integer-only formatting.

- High `.rodata` from lookup tables/strings:
  - Compress or reduce tables.
  - Deduplicate string literals.

- Large C++ runtime artifacts (`__cxa*`, RTTI/vtables/exceptions usage):
  - Consider `-fno-exceptions` and/or `-fno-rtti` where safe.
  - Avoid patterns that pull in dynamic exception machinery.

- Many calls into float helper routines:
  - Use fixed-point for non-critical paths.
  - Avoid implicit float formatting/conversions.

- High static RAM (`.data`/`.bss`):
  - Move rarely-used buffers to dynamic/lazy allocation if safe.
  - Shrink caches, ring buffers, and duplicate state.

## Output format expected from the agent

Return:
1. **Size summary** (section totals)
2. **Top offenders** (top functions/files/variables)
3. **Top 5 recommendations**, each with impact + risk
4. **Quick wins first** (lowest risk/highest gain)

## Generic example

Build your target with your normal build command, then run:

```bash
uv run --with puncover python ./puncover_export.py \
  --elf /path/to/build/firmware.elf \
  --gcc-tools-base /path/to/arm-none-eabi- \
  --src-root /path/to/repo \
  --build-dir /path/to/build \
  --out /tmp/size-report.json
```

Then use `/tmp/size-report.json` to provide recommendations.
