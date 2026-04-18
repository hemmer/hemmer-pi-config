# embedded-build-size

Portable Pi skill for analyzing embedded ELF size and generating actionable size-reduction recommendations.

## Files

- `SKILL.md` — skill instructions the agent follows
- `puncover_export.py` — machine-readable JSON exporter built on puncover internals

## What it does

1. Captures section totals via `<tool-prefix>size -A <elf>`
2. Extracts symbol/file size data using puncover internals
3. Produces JSON suitable for agent reasoning and automation
4. Guides output toward prioritized recommendations (impact + risk)

## Requirements

- `uv` available in PATH
- Toolchain prefix for binutils (for example `/path/to/arm-none-eabi-`)
- An ELF/shared object to inspect

## Quick run (from this folder)

```bash
uv run --with puncover python ./puncover_export.py \
  --elf /path/to/firmware.elf \
  --gcc-tools-base /path/to/arm-none-eabi- \
  --src-root /path/to/repo \
  --build-dir /path/to/build \
  --out /tmp/size-report.json
```

## Sharing

This skill is path-portable:
- script references in `SKILL.md` are relative (`./puncover_export.py`)
- host-specific toolchain and ELF paths are passed at runtime

To share, copy this folder to another machine and update runtime arguments.
