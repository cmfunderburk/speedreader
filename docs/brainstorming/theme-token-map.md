# Theme Token Map

This map defines the core color tokens for `Dark` and `Light` themes.  
`System` mode resolves to one of these based on OS preference.

| Token | Dark | Light |
|---|---|---|
| `--bg-primary` | `#1c1a17` | `#f6f1e6` |
| `--bg-secondary` | `#252320` | `#fdf8ef` |
| `--bg-tertiary` | `#151310` | `#e8ddc9` |
| `--text-primary` | `#e8e0d4` | `#2b2418` |
| `--text-secondary` | `#9a9186` | `#6b5c48` |
| `--text-muted` | `#5c564e` | `#988770` |
| `--accent` | `#d4a04a` | `#b97622` |
| `--accent-hover` | `#e0b45e` | `#ca8630` |
| `--border` | `#3a3530` | `#d0c2ad` |
| `--success` | `#7ab87a` | `#2f8f4f` |
| `--text-color-a` | `#8ec8a0` | `#2d7f61` |
| `--text-color-b` | `#b4a0c4` | `#6c5897` |
| `--noise-opacity` | `0.025` | `0.015` |

## Notes

- Light mode keeps the same semantic token usage, so no component-level branching is needed.
- Accent remains warm/golden in both themes to preserve brand continuity.
- Noise opacity is reduced in light mode to avoid visual grain on pale backgrounds.
