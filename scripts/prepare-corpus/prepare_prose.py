#!/usr/bin/env python3
"""Prepare a prose corpus for Reader Random Drill mode.

Builds drillable units from short stories/essays using either:
1) Project Gutenberg sources (downloaded and cached), or
2) Local plain-text files.

Output:
  corpus-prose-easy.jsonl
  corpus-prose-medium.jsonl
  corpus-prose-hard.jsonl

Each line follows the existing app contract:
  { title, text, domain, fk_grade, words, sentences, ... }
"""

from __future__ import annotations

import argparse
import json
import random
import re
import statistics
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests


USER_AGENT = (
    "ReaderProseCorpusBuilder/1.0 "
    "(speed reading training app; https://github.com/cmfunderburk/Reader)"
)
DEFAULT_TARGET_WORDS = 6000
DEFAULT_MAX_WORDS = 8000
DEFAULT_MIN_WORDS = 1200
DEFAULT_MIN_SECTION_WORDS = 250
DEFAULT_MIN_UNIT_WORDS = 800

_WORD_RE = re.compile(r"[A-Za-z']+")
_SENT_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
_GUTENBERG_START_RE = re.compile(
    r"\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK .*?\*\*\*",
    re.IGNORECASE,
)
_GUTENBERG_END_RE = re.compile(
    r"\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK .*?\*\*\*",
    re.IGNORECASE,
)
_TITLE_WORD_RE = re.compile(r"^[A-Z][A-Za-z'’-]*$")
_UPPER_WORD_RE = re.compile(r"^[A-Z][A-Z'’-]*$")
_VOWELS = set("aeiouyAEIOUY")
_EXCLUDED_SECTION_NAMES = {
    "INDEX",
    "THE END",
    "CONTENTS",
    "TABLE OF CONTENTS",
}
_NUMERIC_HEADING_RE = re.compile(r"^\d+[.)]?$")
_ROMAN_HEADING_RE = re.compile(r"^[IVXLCDM]+[.)]?$", re.IGNORECASE)
_EMPHASIZED_HEADING_RE = re.compile(r"^[_*][^_*]{2,120}[_*]$")


@dataclass
class SourceSpec:
    source_type: str
    gutenberg_id: int | None = None
    file_path: str | None = None
    url: str | None = None


@dataclass
class WorkSpec:
    work_id: str
    author: str
    title: str
    source: SourceSpec
    domain: str
    unit_type: str
    tags: list[str]
    split_mode: str


def count_words(text: str) -> int:
    return len(_WORD_RE.findall(text))


def count_syllables(word: str) -> int:
    token = word.strip(".,;:!?\"'()[]")
    if not token:
        return 1
    count = 0
    prev_vowel = False
    for ch in token:
        is_vowel = ch in _VOWELS
        if is_vowel and not prev_vowel:
            count += 1
        prev_vowel = is_vowel
    if token.endswith("e") and count > 1:
        count -= 1
    return max(1, count)


def sentence_count(text: str) -> int:
    return max(1, len(re.findall(r"[.!?]+", text)))


def flesch_kincaid_grade(text: str) -> float:
    words = text.split()
    n_words = len(words)
    if n_words == 0:
        return 0.0
    n_sents = sentence_count(text)
    n_syllables = sum(count_syllables(w) for w in words)
    return 0.39 * (n_words / n_sents) + 11.8 * (n_syllables / n_words) - 15.59


def strip_gutenberg_boilerplate(text: str) -> str:
    start_match = _GUTENBERG_START_RE.search(text)
    end_match = _GUTENBERG_END_RE.search(text)

    if start_match:
        text = text[start_match.end() :]
    if end_match:
        text = text[: end_match.start()]

    return text.strip()


def normalize_text(raw: str) -> str:
    text = raw.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\ufeff", "")
    text = strip_gutenberg_boilerplate(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def to_paragraphs(text: str) -> list[str]:
    lines = text.split("\n")
    paragraphs: list[str] = []
    current: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if current:
                paragraphs.append(" ".join(current).strip())
                current = []
            continue
        current.append(stripped)
    if current:
        paragraphs.append(" ".join(current).strip())
    return [p for p in paragraphs if p]


def looks_like_heading(paragraph: str) -> bool:
    p = paragraph.strip()
    p_trimmed = p.strip(" \"'“”‘’()[]{}")
    if not p:
        return False
    if len(p) > 100:
        return False
    if p_trimmed.endswith((".", "!", "?")):
        return False
    words = p.split()
    if len(words) > 12:
        return False

    if p.lower().startswith(("chapter ", "book ", "part ", "section ")):
        return True

    if len(words) == 1:
        token = re.sub(r"[^\w'’-]", "", words[0])
        # Allow single-word title-case headings (e.g., "Benediction"),
        # but avoid all-caps/roman numeral fragments (e.g., "VI", "II").
        return bool(re.fullmatch(r"[A-Z][a-z]{4,}", token))

    title_like = sum(
        1
        for w in words
        if _TITLE_WORD_RE.fullmatch(w) or _UPPER_WORD_RE.fullmatch(w)
    )
    if title_like / max(1, len(words)) >= 0.8:
        return True

    return False


def is_excluded_section_name(name: str) -> bool:
    cleaned = re.sub(r"\s+", " ", name.strip().upper())
    return cleaned in _EXCLUDED_SECTION_NAMES


def is_structural_heading_paragraph(paragraph: str) -> bool:
    p = paragraph.strip()
    if not p:
        return False

    plain = p.strip(" \"'“”‘’()[]{}")

    if _NUMERIC_HEADING_RE.fullmatch(plain):
        return True
    if _ROMAN_HEADING_RE.fullmatch(plain):
        return True
    if _EMPHASIZED_HEADING_RE.fullmatch(p):
        return True

    if re.search(r"[.!?]", plain):
        return False

    words = re.findall(r"[A-Za-z'’-]+", plain)
    if not words or len(words) > 12:
        return False

    title_like = sum(
        1
        for w in words
        if _TITLE_WORD_RE.fullmatch(w) or _UPPER_WORD_RE.fullmatch(w)
    )
    return title_like / len(words) >= 0.8


def split_sections(
    paragraphs: list[str],
    *,
    split_mode: str,
    min_section_words: int,
) -> list[tuple[str, list[str]]]:
    if split_mode not in {"headings", "none"}:
        raise ValueError(f"Unsupported split mode: {split_mode}")

    if split_mode == "none":
        return [("Full text", paragraphs)]

    heading_indices = [
        i
        for i, p in enumerate(paragraphs)
        if looks_like_heading(p)
    ]
    if not heading_indices:
        return [("Full text", paragraphs)]

    sections: list[tuple[str, list[str]]] = []

    if heading_indices[0] > 0:
        lead_paragraphs = paragraphs[: heading_indices[0]]
        if count_words("\n\n".join(lead_paragraphs)) >= min_section_words:
            sections.append(("Introduction", lead_paragraphs))

    for idx, heading_i in enumerate(heading_indices):
        heading = paragraphs[heading_i]
        body_start = heading_i + 1
        body_end = heading_indices[idx + 1] if idx + 1 < len(heading_indices) else len(paragraphs)
        body = paragraphs[body_start:body_end]
        if not body:
            continue
        if count_words("\n\n".join(body)) < min_section_words:
            continue
        if is_excluded_section_name(heading):
            continue
        sections.append((heading, body))

    if not sections:
        return [("Full text", paragraphs)]
    return sections


def split_oversized_paragraph(
    paragraph: str,
    *,
    target_words: int,
    max_words: int,
) -> list[str]:
    sentences = [s.strip() for s in _SENT_SPLIT_RE.split(paragraph) if s.strip()]
    if not sentences:
        return [paragraph]

    chunks: list[list[str]] = []
    current: list[str] = []
    current_words = 0

    for sentence in sentences:
        w = count_words(sentence)
        if current and current_words + w > max_words:
            chunks.append(current)
            current = [sentence]
            current_words = w
        else:
            current.append(sentence)
            current_words += w
        if current_words >= target_words:
            chunks.append(current)
            current = []
            current_words = 0

    if current:
        chunks.append(current)

    return [" ".join(chunk).strip() for chunk in chunks if chunk]


def chunk_section(
    section_title: str,
    paragraphs: list[str],
    *,
    target_words: int,
    max_words: int,
    min_words: int,
) -> list[tuple[str, str]]:
    items: list[tuple[str, str]] = []
    current: list[str] = []
    current_words = 0

    def emit_current() -> None:
        nonlocal current, current_words
        if not current:
            return
        text = "\n\n".join(current).strip()
        if text:
            items.append((section_title, text))
        current = []
        current_words = 0

    for paragraph in paragraphs:
        if is_structural_heading_paragraph(paragraph):
            # Treat heading-like stubs as boundaries and omit from drill text.
            emit_current()
            continue

        pw = count_words(paragraph)
        if pw > max_words:
            emit_current()
            for piece in split_oversized_paragraph(
                paragraph, target_words=target_words, max_words=max_words
            ):
                items.append((section_title, piece))
            continue

        if current and current_words + pw > max_words:
            emit_current()

        current.append(paragraph)
        current_words += pw

        if current_words >= target_words:
            emit_current()

    emit_current()

    if len(items) <= 1:
        return items

    merged: list[tuple[str, str]] = [items[0]]
    for sec, text in items[1:]:
        w = count_words(text)
        prev_sec, prev_text = merged[-1]
        prev_w = count_words(prev_text)
        if w < min_words and prev_w + w <= max_words:
            merged[-1] = (prev_sec, f"{prev_text}\n\n{text}".strip())
        else:
            merged.append((sec, text))
    return merged


def load_manifest(path: Path) -> list[WorkSpec]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or "works" not in data:
        raise ValueError("Manifest must be an object with a 'works' array")
    works = data["works"]
    if not isinstance(works, list):
        raise ValueError("'works' must be an array")

    parsed: list[WorkSpec] = []
    for item in works:
        if not isinstance(item, dict):
            raise ValueError("Each manifest work entry must be an object")
        source = item.get("source") or {}
        if not isinstance(source, dict):
            raise ValueError("source must be an object")
        source_type = str(source.get("type", "")).strip()
        if source_type not in {"gutenberg", "file", "url"}:
            raise ValueError(f"Unsupported source.type: {source_type}")

        parsed.append(
            WorkSpec(
                work_id=str(item["id"]),
                author=str(item["author"]),
                title=str(item["title"]),
                source=SourceSpec(
                    source_type=source_type,
                    gutenberg_id=int(source["id"]) if source_type == "gutenberg" else None,
                    file_path=str(source["path"]) if source_type == "file" else None,
                    url=str(source["url"]) if source_type == "url" else None,
                ),
                domain=str(item.get("domain", "Prose")),
                unit_type=str(item.get("unit_type", "prose")),
                tags=[str(t) for t in item.get("tags", [])],
                split_mode=str(item.get("split_mode", "headings")),
            )
        )
    return parsed


def fetch_url_text(url: str, session: requests.Session) -> str:
    res = session.get(url, timeout=60)
    res.raise_for_status()
    return res.text


def fetch_gutenberg_text(
    gutenberg_id: int,
    *,
    cache_dir: Path,
    session: requests.Session,
) -> str:
    cache_file = cache_dir / f"gutenberg-{gutenberg_id}.txt"
    if cache_file.exists():
        return cache_file.read_text(encoding="utf-8", errors="ignore")

    candidates = [
        f"https://www.gutenberg.org/cache/epub/{gutenberg_id}/pg{gutenberg_id}.txt",
        f"https://www.gutenberg.org/cache/epub/{gutenberg_id}/pg{gutenberg_id}.txt.utf-8",
        f"https://www.gutenberg.org/files/{gutenberg_id}/{gutenberg_id}-0.txt",
        f"https://www.gutenberg.org/files/{gutenberg_id}/{gutenberg_id}.txt",
    ]

    last_err: Exception | None = None
    for url in candidates:
        try:
            text = fetch_url_text(url, session)
            if len(text.strip()) < 200:
                continue
            cache_file.write_text(text, encoding="utf-8")
            return text
        except Exception as err:  # noqa: BLE001
            last_err = err
            continue

    if last_err:
        raise last_err
    raise RuntimeError(f"Unable to download Gutenberg text for id={gutenberg_id}")


def load_work_text(
    work: WorkSpec,
    *,
    manifest_dir: Path,
    cache_dir: Path,
    session: requests.Session,
) -> str:
    source = work.source
    if source.source_type == "gutenberg":
        assert source.gutenberg_id is not None
        return fetch_gutenberg_text(source.gutenberg_id, cache_dir=cache_dir, session=session)
    if source.source_type == "file":
        if not source.file_path:
            raise ValueError(f"Work {work.work_id}: missing source.path")
        p = Path(source.file_path)
        if not p.is_absolute():
            p = (manifest_dir / p).resolve()
        return p.read_text(encoding="utf-8", errors="ignore")
    if source.source_type == "url":
        if not source.url:
            raise ValueError(f"Work {work.work_id}: missing source.url")
        return fetch_url_text(source.url, session)
    raise ValueError(f"Work {work.work_id}: unsupported source type {source.source_type}")


def z_score(values: list[float]) -> list[float]:
    if not values:
        return []
    mean = statistics.mean(values)
    stdev = statistics.stdev(values) if len(values) > 1 else 0.0
    if stdev == 0:
        return [0.0 for _ in values]
    return [(v - mean) / stdev for v in values]


def assign_tiers(records: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    if not records:
        return {"easy": [], "medium": [], "hard": []}
    if len(records) < 3:
        return {"easy": [], "medium": [], "hard": records}

    fk_vals = [float(r["fk_grade"]) for r in records]
    poly_vals = [float(r["pct_poly"]) for r in records]
    burden_vals = [float(r["factual_burden"]) for r in records]

    fk_z = z_score(fk_vals)
    poly_z = z_score(poly_vals)
    burden_z = z_score(burden_vals)

    ranked: list[tuple[float, dict[str, Any]]] = []
    for i, rec in enumerate(records):
        # Lower factual burden is desirable for linguistic fluency drills,
        # so burden contributes negatively to difficulty.
        difficulty = 0.6 * fk_z[i] + 0.3 * poly_z[i] - 0.1 * burden_z[i]
        rec["_difficulty"] = difficulty
        ranked.append((difficulty, rec))

    by_author: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for _, rec in ranked:
        by_author[rec["author"]].append(rec)

    easy: list[dict[str, Any]] = []
    medium: list[dict[str, Any]] = []
    hard: list[dict[str, Any]] = []

    for author_rows in by_author.values():
        author_rows.sort(key=lambda r: float(r["_difficulty"]))
        n = len(author_rows)
        if n == 1:
            hard.extend(author_rows)
            continue
        if n == 2:
            medium.append(author_rows[0])
            hard.append(author_rows[1])
            continue

        cut1 = max(1, n // 3)
        cut2 = max(cut1 + 1, (2 * n) // 3)
        if cut2 >= n:
            cut2 = n - 1

        easy.extend(author_rows[:cut1])
        medium.extend(author_rows[cut1:cut2])
        hard.extend(author_rows[cut2:])

    for row in easy + medium + hard:
        row.pop("_difficulty", None)
    return {"easy": easy, "medium": medium, "hard": hard}


def factual_burden_score(text: str) -> float:
    tokens = re.findall(r"\b[\w'-]+\b", text)
    if not tokens:
        return 0.0
    digit_count = sum(1 for t in tokens if any(ch.isdigit() for ch in t))
    capital_mid = 0
    for token in tokens:
        if token[:1].isupper() and token[1:].islower():
            capital_mid += 1
    return (digit_count + capital_mid) / len(tokens)


def pct_polysyllabic(text: str) -> float:
    words = _WORD_RE.findall(text)
    if not words:
        return 0.0
    poly = sum(1 for w in words if count_syllables(w) >= 3)
    return poly / len(words)


def build_records(
    works: list[WorkSpec],
    *,
    manifest_dir: Path,
    cache_dir: Path,
    target_words: int,
    max_words: int,
    min_words: int,
    min_section_words: int,
    min_unit_words: int,
    shuffle_seed: int | None,
) -> list[dict[str, Any]]:
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    records: list[dict[str, Any]] = []

    for work in works:
        print(f"Loading work: {work.author} - {work.title}")
        raw_text = load_work_text(
            work,
            manifest_dir=manifest_dir,
            cache_dir=cache_dir,
            session=session,
        )
        norm_text = normalize_text(raw_text)
        paragraphs = to_paragraphs(norm_text)
        if not paragraphs:
            print(f"  Skipped {work.work_id}: no paragraphs after normalization")
            continue

        sections = split_sections(
            paragraphs,
            split_mode=work.split_mode,
            min_section_words=min_section_words,
        )

        unit_index = 1
        for section_title, section_paragraphs in sections:
            chunks = chunk_section(
                section_title,
                section_paragraphs,
                target_words=target_words,
                max_words=max_words,
                min_words=min_words,
            )

            for sec_name, chunk_text in chunks:
                wc = count_words(chunk_text)
                if wc < min_unit_words:
                    continue

                sc = sentence_count(chunk_text)
                fk = flesch_kincaid_grade(chunk_text)
                poly = pct_polysyllabic(chunk_text)
                burden = factual_burden_score(chunk_text)

                title = f"{work.author} - {work.title} - {sec_name} ({unit_index})"
                records.append(
                    {
                        "title": title,
                        "text": chunk_text,
                        "domain": work.domain,
                        "fk_grade": round(fk, 1),
                        "words": wc,
                        "sentences": sc,
                        "author": work.author,
                        "work_title": work.title,
                        "work_id": work.work_id,
                        "unit_type": work.unit_type,
                        "tags": work.tags,
                        "section": sec_name,
                        "pct_poly": round(poly, 4),
                        "factual_burden": round(burden, 4),
                    }
                )
                unit_index += 1

        print(f"  Units built: {unit_index - 1}")

    if shuffle_seed is not None:
        rng = random.Random(shuffle_seed)
        rng.shuffle(records)
    return records


def write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as f:
        for record in records:
            out = {
                "title": record["title"],
                "text": record["text"],
                "domain": record["domain"],
                "fk_grade": record["fk_grade"],
                "words": record["words"],
                "sentences": record["sentences"],
                "author": record["author"],
                "work_title": record["work_title"],
                "work_id": record["work_id"],
                "unit_type": record["unit_type"],
                "tags": record["tags"],
                "section": record["section"],
            }
            f.write(json.dumps(out, ensure_ascii=False) + "\n")


def print_stats(tiered: dict[str, list[dict[str, Any]]]) -> None:
    print("\nTier summary:")
    for tier in ("easy", "medium", "hard"):
        rows = tiered[tier]
        if not rows:
            print(f"  {tier:6s} 0 units")
            continue
        words = [r["words"] for r in rows]
        fks = [r["fk_grade"] for r in rows]
        print(
            f"  {tier:6s} {len(rows):4d} units"
            f"  words(mean={statistics.mean(words):.0f}, max={max(words)})"
            f"  fk(mean={statistics.mean(fks):.1f})"
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build prose corpus tiers for Reader Random Drill mode."
    )
    parser.add_argument(
        "--manifest",
        default="prose-seed-manifest.json",
        help="Manifest path (default: prose-seed-manifest.json in this directory)",
    )
    parser.add_argument(
        "--cache-dir",
        default=".prose-cache",
        help="Cache directory for downloaded source text",
    )
    parser.add_argument(
        "--target-words",
        type=int,
        default=DEFAULT_TARGET_WORDS,
        help=f"Soft per-unit word target (default: {DEFAULT_TARGET_WORDS})",
    )
    parser.add_argument(
        "--max-words",
        type=int,
        default=DEFAULT_MAX_WORDS,
        help=f"Hard per-unit word limit (default: {DEFAULT_MAX_WORDS})",
    )
    parser.add_argument(
        "--min-words",
        type=int,
        default=DEFAULT_MIN_WORDS,
        help=f"Preferred minimum unit size before merge (default: {DEFAULT_MIN_WORDS})",
    )
    parser.add_argument(
        "--min-section-words",
        type=int,
        default=DEFAULT_MIN_SECTION_WORDS,
        help=f"Minimum section size retained after heading split (default: {DEFAULT_MIN_SECTION_WORDS})",
    )
    parser.add_argument(
        "--min-unit-words",
        type=int,
        default=DEFAULT_MIN_UNIT_WORDS,
        help=f"Minimum output unit size (default: {DEFAULT_MIN_UNIT_WORDS})",
    )
    parser.add_argument(
        "--output-prefix",
        default="corpus-prose",
        help="Output prefix for tier files (default: corpus-prose)",
    )
    parser.add_argument(
        "--shuffle-seed",
        type=int,
        default=None,
        help="Optional deterministic shuffle seed before tiering",
    )

    args = parser.parse_args()

    if args.max_words > 8000:
        print("Error: --max-words cannot exceed 8000 for drillability policy.")
        sys.exit(1)
    if args.target_words > args.max_words:
        print("Error: --target-words cannot exceed --max-words.")
        sys.exit(1)

    script_dir = Path(__file__).parent
    manifest_path = Path(args.manifest)
    if not manifest_path.is_absolute():
        manifest_path = (script_dir / manifest_path).resolve()
    if not manifest_path.exists():
        print(f"Manifest not found: {manifest_path}")
        sys.exit(1)

    cache_dir = Path(args.cache_dir)
    if not cache_dir.is_absolute():
        cache_dir = (script_dir / cache_dir).resolve()
    cache_dir.mkdir(parents=True, exist_ok=True)

    works = load_manifest(manifest_path)
    if not works:
        print("No works found in manifest.")
        sys.exit(1)

    print(f"Loaded manifest with {len(works)} works.")
    print(
        f"Unit policy: target={args.target_words}, max={args.max_words},"
        f" min={args.min_words} words"
    )

    records = build_records(
        works,
        manifest_dir=manifest_path.parent,
        cache_dir=cache_dir,
        target_words=args.target_words,
        max_words=args.max_words,
        min_words=args.min_words,
        min_section_words=args.min_section_words,
        min_unit_words=args.min_unit_words,
        shuffle_seed=args.shuffle_seed,
    )
    if not records:
        print("No records generated.")
        sys.exit(1)

    tiered = assign_tiers(records)
    print_stats(tiered)

    for tier in ("easy", "medium", "hard"):
        out_path = script_dir / f"{args.output_prefix}-{tier}.jsonl"
        write_jsonl(out_path, tiered[tier])
        size_mb = out_path.stat().st_size / (1024 * 1024)
        print(f"Wrote {len(tiered[tier]):,} rows to {out_path.name} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
