---
name: Library Content Preprocessor
description: This skill should be used when the user asks to "preprocess library content", "clean up a PDF", "optimize content for speed reading", "fix extracted text", "review library file", or discusses improving text quality for the speed reader. Handles variable content types including EPUBs, web-saved PDFs, academic papers, and book chapters.
---

# Library Content Preprocessor

This skill assists with preprocessing and optimizing library content for the SpeedRead application. Since library content varies significantly (Gutenberg EPUBs, web pages saved as PDFs, academic papers, scanned book chapters), automated cleanup often needs LLM-assisted finishing touches.

## Content Sources and Their Challenges

The `library/` directory contains three collections:

### Classics (`library/classics/`)
- **Source**: Project Gutenberg EPUBs, public domain texts
- **Issues**: Gutenberg headers/footers, transcriber notes, inconsistent formatting
- **Example**: `brothers-karamazov.epub`, `nicomachean-ethics.epub`

### Articles (`library/articles/`)
- **Source**: Academic papers, web pages saved as PDF, short works
- **Issues**: Web print artifacts (timestamps, URLs), paper metadata (author blocks, abstracts), reference sections
- **Example**: `attention.pdf` (academic), `wittgenstein-lecture-on-ethics.pdf` (web-saved)

### References (`library/references/`)
- **Source**: Textbook chapters split into individual PDFs
- **Issues**: Running headers/footers, page numbers, cross-references, frontmatter files
- **Structure**: Organized by book (e.g., `kreps-micro-foundations-i/`, `osborne-rubinstein-game-theory/`)

## Existing Cleanup Infrastructure

The app has an automated cleanup module at `electron/lib/cleanup.ts` with these capabilities:

```typescript
interface CleanupOptions {
  removeReferences?: boolean      // Bibliography sections
  removeAbstract?: boolean        // Academic abstracts
  removeAffiliations?: boolean    // Author emails, institutions
  removePageNumbers?: boolean     // Various page number formats
  removeFootnotes?: boolean       // Bracketed footnote markers
  repairHyphenation?: boolean     // Rejoin split words
  normalizeLineBreaks?: boolean   // Fix mid-sentence breaks
  removeRunningHeaders?: boolean  // Repeated page headers
  removeWebMetadata?: boolean     // URLs, timestamps, CC notices
}
```

The automated cleanup handles common patterns but cannot:
- Distinguish meaningful content from boilerplate in edge cases
- Fix OCR errors or garbled text
- Identify section boundaries in poorly structured documents
- Handle content-specific decisions (keep this footnote? remove this aside?)

## Preprocessing Workflow

### Step 1: Assess Content Quality

To assess a library file, extract and examine its content:

```bash
# For PDFs - use the app's extraction
node -e "
const { extractPdfText } = require('./dist-electron/lib/pdf.js');
extractPdfText('library/articles/FILENAME.pdf', { cleanup: false })
  .then(r => console.log(r.content.substring(0, 3000)));
"
```

Or read the file directly to see raw extraction issues.

Identify:
- Content type (academic paper, book chapter, web article, literature)
- Major artifacts (page numbers, headers, metadata blocks)
- Text quality (clean extraction vs. OCR errors vs. no text layer)
- Structure (chapters, sections, continuous prose)

### Step 2: Apply Automated Cleanup

Test the automated cleanup on the content:

```bash
node -e "
const { cleanupText } = require('./dist-electron/lib/cleanup.js');
const fs = require('fs');
// ... extract and clean
"
```

Note what the automated cleanup handles well and what remains.

### Step 3: LLM-Assisted Refinement

For issues the automated cleanup cannot handle, apply targeted fixes:

**Boilerplate identification**: Review extracted text and identify blocks that should be removed but weren't caught by pattern matching.

**Content decisions**: Determine whether to keep or remove:
- Translator's notes in classic literature
- Extensive footnotes that break reading flow
- Section headers that may or may not be useful
- Cross-references to figures/tables (useless without the figures)

**Text repair**: Fix:
- OCR artifacts (common character substitutions: rn→m, l→1, O→0)
- Garbled Unicode or encoding issues
- Sentence fragments from column layout extraction

### Step 4: Create Optimized Version

Options for storing optimized content:

1. **Pre-extracted text files**: Store cleaned `.txt` alongside source files
2. **Metadata files**: Create `.meta.json` with cleanup decisions
3. **Direct modification**: For user-owned content, update the source

## Common Content Patterns

### Gutenberg EPUBs
```
*** START OF THE PROJECT GUTENBERG EBOOK ***
[content]
*** END OF THE PROJECT GUTENBERG EBOOK ***
Transcriber's Notes: [notes]
```
**Action**: Remove Gutenberg markers and transcriber notes unless specifically relevant.

### Web-Saved PDFs
```
12/23/25, 9:21 AM    Page Title - Website Name
https://example.com/page    1/8
-- 1 of 8 --
[content repeated with headers on each page]
```
**Action**: Remove timestamps, URLs, page fractions. The automated cleanup handles most of this.

### Academic Papers
```
Title
Author1, Author2
Institution, email@domain.com
Abstract: [abstract text]
1. Introduction
[content]
References
[bibliography]
```
**Action**: Optionally keep abstract (useful context), remove author block and references.

### Textbook Chapters
```
Chapter 5: Topic Name
[content with section numbers like 5.1, 5.2]
[running header: "Chapter 5: Topic Name" on each page]
[page numbers]
[cross-references: "See Figure 5.3" or "As shown in Section 5.1"]
```
**Action**: Remove running headers/page numbers. Keep or contextualize cross-references.

## Reference Files

For detailed patterns and edge cases:
- **`references/content-patterns.md`** - Specific patterns for each content type with examples

## Workflow Commands

When preprocessing library content:

1. **List available content**: `ls -la library/{classics,articles,references}`
2. **Check file type**: `file library/path/to/file.pdf`
3. **Extract sample**: Use node script above or read directly
4. **Test cleanup**: Apply cleanup module and review output
5. **Apply LLM fixes**: Edit cleanup.ts patterns or create content-specific overrides

## Output Considerations for Speed Reading

Optimized content for the speed reader should:

- Flow continuously without jarring breaks
- Avoid orphaned references ("See Figure 3" with no figure)
- Preserve meaningful structure (paragraph breaks, section transitions)
- Remove visual artifacts (page numbers, headers) that interrupt reading
- Keep content that aids comprehension (abstracts, key definitions)
- Remove content that breaks immersion (lengthy footnotes, bibliographies)

The goal is text that reads naturally when presented word-by-word or phrase-by-phrase at speed.
