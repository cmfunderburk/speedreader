# Prose Corpus Builder

`prepare_prose.py` builds a drill-focused prose corpus from a manifest of public-domain works.

Outputs:
- `corpus-prose-easy.jsonl`
- `corpus-prose-medium.jsonl`
- `corpus-prose-hard.jsonl`

## Usage

```bash
cd scripts/prepare-corpus
python prepare_prose.py \
  --manifest prose-seed-manifest.json \
  --target-words 6000 \
  --max-words 8000
```

## Drillability policy

- Target excerpt size: `~6000` words (`--target-words`).
- Absolute maximum excerpt size: `8000` words (`--max-words`).
- Units are split on paragraph boundaries when possible.
- Oversize paragraphs are split by sentence boundaries.

## Manifest format

Top-level object with `works` array:

```json
{
  "works": [
    {
      "id": "fitzgerald-flappers-and-philosophers",
      "author": "F. Scott Fitzgerald",
      "title": "Flappers and Philosophers",
      "source": { "type": "gutenberg", "id": 4368 },
      "domain": "Prose Fiction",
      "unit_type": "short_story",
      "split_mode": "headings",
      "tags": ["fiction", "short-stories"]
    }
  ]
}
```

Supported source types:
- `{"type":"gutenberg","id":<ebook_id>}`
- `{"type":"file","path":"relative-or-absolute.txt"}`
- `{"type":"url","url":"https://..."}` (plain text endpoints only)

`split_mode` options:
- `headings`: split by heading-like paragraphs, then chunk
- `none`: treat full text as one stream, then chunk

## Notes

- Gutenberg downloads are cached under `.prose-cache/`.
- The current seed manifest focuses on short stories and essays by:
  Hemingway, Fitzgerald, Woolf, Mencken, and Cather.
