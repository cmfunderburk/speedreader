# Example: Preprocessing Workflow

This example demonstrates preprocessing a web-saved PDF (wittgenstein-lecture-on-ethics.pdf).

## Step 1: Initial Assessment

Extract raw content to assess quality:

```bash
node -e "
const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function extract() {
  const buffer = fs.readFileSync('library/articles/wittgenstein-lecture-on-ethics.pdf');
  const parser = new PDFParse(new Uint8Array(buffer));
  await parser.load();
  const result = await parser.getText();
  console.log('=== FIRST 2000 CHARS ===');
  console.log(result.text.substring(0, 2000));
  console.log('=== LAST 1000 CHARS ===');
  console.log(result.text.substring(result.text.length - 1000));
  await parser.destroy();
}
extract();
"
```

**Findings**:
- Content type: Web page saved as PDF (from Wittgenstein Project)
- Artifacts: Timestamps, URLs, page numbers, Creative Commons notice
- Quality: Good text extraction, clear structure
- Issue: Metadata block at start, repeated headers throughout

## Step 2: Test Automated Cleanup

```bash
node -e "
const { cleanupText } = require('./dist-electron/lib/cleanup.js');
// ... test with extracted content
"
```

**Results**:
- Page numbers removed (-- X of Y --)
- URLs removed
- Timestamps removed
- Some Creative Commons text remains
- Content is readable

## Step 3: Identify Remaining Issues

After automated cleanup:
1. Fragment "life plus 70 years or fewer." at start (CC remnant)
2. Title "Ludwig Wittgenstein / Lecture on Ethics" appears twice
3. Main content is clean and flows well

## Step 4: LLM-Assisted Decision

**Question**: Should we modify cleanup.ts patterns or handle this specific file?

**Analysis**:
- The CC license fragment is an edge case
- Duplicate titles are common in web-to-PDF
- These issues are minor and don't significantly impact reading

**Decision**: The automated cleanup is sufficient for this file. The remaining artifacts are:
- Brief (< 20 words total)
- At the start (reader can skip)
- Not disruptive to the main content flow

## Step 5: Document for Future Reference

Note patterns that might benefit from improved automation:
- Creative Commons blocks could be more aggressively filtered
- Duplicate title detection could compare first N lines

## Alternative: Manual Preprocessing

For higher-quality results, create a cleaned text file:

```bash
# Extract, clean, and save
node -e "
const { extractPdfText } = require('./dist-electron/lib/pdf.js');
const fs = require('fs');

extractPdfText('library/articles/wittgenstein-lecture-on-ethics.pdf')
  .then(result => {
    // Additional manual cleanup
    let text = result.content;

    // Remove the specific CC remnant
    text = text.replace(/^.*?life plus 70 years or fewer\.\s*/s, '');

    // Remove duplicate title (keep second occurrence which starts the actual lecture)
    const lines = text.split('\n');
    // ... custom logic

    fs.writeFileSync('library/articles/wittgenstein-lecture-on-ethics.txt', text);
    console.log('Cleaned text saved');
  });
"
```

## Result

The file is now optimized for speed reading:
- Clean continuous prose
- No page artifacts
- Proper paragraph structure
- Flows naturally at reading speed
