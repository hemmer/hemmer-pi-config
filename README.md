# hemmer-pi-config

Personal Pi agent configuration repository.

## Layout

- `extensions/` — custom Pi extensions
- `skills/` — custom or vendored skills

Current contents:

- `extensions/llama-swap-model-sync.ts`
  - Syncs model IDs from llama-swap (`/v1/models`)
  - Tries to detect active model context windows via `/running` + backend `/props`
  - Re-registers provider models so `/model` and status info stay in sync

- `skills/embedded-build-size/`
  - Vendored copy of embedded build size analysis skill

## Using this repo with Pi

Either:

1. Copy files into `~/.pi/agent/` manually, or
2. Symlink directories from this repo into `~/.pi/agent/`

Example (symlink extension):

```bash
ln -sf ~/hemmer-pi-config/extensions/llama-swap-model-sync.ts ~/.pi/agent/extensions/llama-swap-model-sync.ts
```

Then run `/reload` inside Pi.
