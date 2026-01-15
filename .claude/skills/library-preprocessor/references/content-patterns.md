# Content Patterns Reference

Detailed patterns and examples for each content type in the library.

## Classics Collection Patterns

### Project Gutenberg EPUBs

**Header pattern** (appears at start):
```
The Project Gutenberg eBook of [Title]

This eBook is for the use of anyone anywhere in the United States and
most other parts of the world at no cost and with almost no restrictions
whatsoever. You may copy it, give it away or re-use it under the terms
of the Project Gutenberg License included with this eBook or online at
www.gutenberg.org. If you are not located in the United States, you
will have to check the laws of the country where you are located before
using this eBook.

Title: [Title]
Author: [Author]
Release Date: [Date]
Language: English

*** START OF THE PROJECT GUTENBERG EBOOK [TITLE] ***
```

**Footer pattern** (appears at end):
```
*** END OF THE PROJECT GUTENBERG EBOOK [TITLE] ***

Updated editions will replace the previous one—the old editions will
be renamed.
[... lengthy license text ...]

*** END OF THE PROJECT GUTENBERG EBOOK [TITLE] ***
```

**Transcriber notes** (variable location):
```
Transcriber's Notes:
- Obvious typographical errors have been silently corrected.
- Archaic or variant spelling has been retained.
```

**Recommended cleanup**: Remove everything before "*** START" and after "*** END". Optionally preserve transcriber notes if they contain useful context about the edition.

### Public Domain Scans

**Common OCR errors**:
- `rn` → `m` (e.g., "bum" instead of "burn")
- `l` → `1` or `I`
- `O` → `0`
- `fi` → missing (ligature not recognized)
- Broken words across line breaks

**Scan artifacts**:
- Page numbers embedded in text flow
- Running headers mixed with content
- Margin notes pulled into main text
- Hyphenation without proper rejoining

## Articles Collection Patterns

### Academic Papers (e.g., attention.pdf)

**Standard structure**:
```
[Title - often in larger font, extracted as separate line]
[Authors with superscript markers]
[Affiliations with emails]
[Abstract section]
[Keywords (optional)]
1. Introduction
2. Related Work / Background
3. Method / Approach
4-N. [Content sections]
N+1. Conclusion
References / Bibliography
[Appendices (optional)]
```

**Author block patterns**:
```
Ashish Vaswani∗
Google Brain
avaswani@google.com
```

**Footnote markers**: Superscript numbers `¹²³` or symbols `∗†‡` often extracted inline.

**Equation artifacts**: LaTeX or MathML may extract as garbled text:
```
Good: "E = mc²"
Bad: "E = mc2" or "E equals m c squared"
Ugly: "\mathcal{E} = \sum_{i=1}^{n}"
```

**Citation patterns**:
- Inline: `[1]`, `[Smith et al., 2020]`, `(Smith 2020)`
- These break reading flow but may provide context

### Web-Saved PDFs (e.g., wittgenstein-lecture-on-ethics.pdf)

**Print header** (appears on every page):
```
12/23/25, 9:21 AM    Page Title - Website Name
```

**Print footer variants**:
```
https://www.example.com/path/to/page    1/8
-- 1 of 8 --
Page 1 of 8
```

**Navigation artifacts**:
```
← Previous | Next →
Share: Twitter Facebook Email
Related Articles:
```

**Cookie/consent banners** (sometimes captured):
```
This website uses cookies to improve your experience.
Accept | Decline | Learn More
```

**Creative Commons blocks**:
```
This work is licensed under Creative Commons Attribution...
This digital edition is based on...
```

### Short Stories/Essays

**Magazine metadata**:
```
Originally published in [Magazine Name], [Date]
© [Year] [Author]. All rights reserved.
```

**Section breaks** (often rendered inconsistently):
```
* * *
---
• • •
[blank space]
```

## References Collection Patterns

### Textbook Chapter PDFs

**Consistent structure per book**:
```
library/references/[book-name]/
├── 00-front-matter.pdf      # Title, copyright, TOC
├── 00-preface.pdf           # Author preface
├── 01-introduction.pdf      # First chapter
├── 02-chapter-name.pdf      # Subsequent chapters
├── ...
├── A01-appendix-name.pdf    # Appendices
├── 99-references.pdf        # Bibliography
└── 99-index.pdf             # Book index
```

**Chapter header patterns**:
```
CHAPTER 5

Topic Name

5.1 First Section
```

Or:
```
5
Topic Name

Introduction text begins here...
```

**Running headers** (appear on every page, alternating):
```
Even pages: "Chapter 5: Topic Name"
Odd pages: "Section 5.2: Subsection Name"
```

Or:
```
Left pages: "AUTHOR NAME"
Right pages: "BOOK TITLE"
```

**Page numbers** (variable positioning):
```
Centered: "127"
Corner: "127" or "5-12" (chapter-page)
With decoration: "— 127 —" or "[ 127 ]"
```

**Cross-references** (problematic for speed reading):
```
As shown in Figure 5.3...
See Section 3.2 for details...
Recall from Chapter 2 that...
The proof appears in Appendix A...
```

**Mathematical content** (common in economics texts):
```
Clean: "maximize U(x,y) subject to px + qy ≤ m"
Garbled: "maximize U(x;y) subject to px + qy  m"
Missing: [entire equation rendered as image, no text]
```

**Footnotes in textbooks**:
```
¹ This result was first proven by Smith (1954).
² The assumption of continuity can be relaxed; see Exercise 5.7.
```

### Book-Specific Patterns

**Kreps Microeconomic Foundations**:
- Heavy use of mathematical notation
- Numbered propositions and theorems
- End-of-chapter problems
- Appendices with proofs

**Osborne-Rubinstein Game Theory**:
- Definition/Proposition/Proof structure
- Game-theoretic notation (strategy profiles, payoff matrices)
- Historical notes sections

**Chicago Price Theory**:
- Applied examples with specific numbers
- Policy analysis sections
- References to empirical data

## Detection Heuristics

### Identifying Content Type

**Academic paper indicators**:
- "Abstract" section near start
- Author email addresses
- "References" or "Bibliography" section
- Numbered sections (1., 2., 3.)
- Citation markers ([1], [Smith 2020])

**Web-saved PDF indicators**:
- URL in header/footer
- Timestamp pattern (MM/DD/YY, HH:MM AM/PM)
- "Page X of Y" format
- Navigation text (Previous, Next, Share)

**Textbook chapter indicators**:
- "Chapter N" heading
- Section numbers (N.M format)
- Exercise/Problem sections
- Cross-references to other chapters
- Consistent formatting across files in same directory

**Literature/fiction indicators**:
- Dialogue formatting (quotation marks, speaker tags)
- Chapter titles without numbers
- No citations or references
- Narrative prose style

### Quality Assessment

**Good text extraction**:
- Complete sentences
- Proper paragraph breaks
- Correct punctuation
- Readable flow

**Moderate issues**:
- Occasional OCR errors
- Missing paragraph breaks
- Stray page numbers
- Minor formatting issues

**Poor extraction**:
- Garbled text blocks
- Missing large sections
- Completely wrong character encoding
- Image-only PDF (no text layer)

## Cleanup Priority by Content Type

### High Value, Low Effort
1. Web-saved PDFs - patterns are predictable
2. Standard academic papers - clear structure
3. Gutenberg EPUBs - markers are consistent

### High Value, Medium Effort
1. Textbook chapters - need chapter-specific rules
2. Well-scanned books - some OCR cleanup needed

### Lower Priority
1. Scanned historical documents - heavy OCR issues
2. Math-heavy content - equations don't speed-read well
3. Reference materials (index, bibliography) - not for reading
