// Extracts per-element narrative from an uploaded previous-inspection
// PDF/Word document, for spanSense Author's "Upload a previous inspection"
// flow (structures whose last inspection wasn't done in spanSense).
//
// Approach: rely on document ORDER rather than name-matching. UK bridge
// inspection reports following the standard "Description of Defects"
// convention (the same one spanSense's own element taxonomy is built on -
// see author/authorElements.js) number every element as "X.Y.Z <name>"
// in a fixed, complete, category-grouped sequence - even elements with
// nothing to report get their own numbered "Not applicable" entry. So the
// Nth "X.Y.Z" heading found in the document is assumed to correspond to
// the Nth element in spanSense's own element list for that structure type
// (ordered the same way, by display_order), with no need to fuzzy-match
// heading wording against the DB's own element names.
//
// This is a best-effort, review-required extraction (confirmed acceptable
// scope with the user) - no severity/extent parsing (the numeric BCI
// Proforma table in real-world scans extracts as an unreliable, column-
// order-losing jumble; guessing wrong here would be worse than leaving it
// for the user to set), no photo extraction.

const HEADING_RE = /^(\d+)\.(\d+)\.(\d+)[ \t]+(.+)$/gm;

// A category-level heading (e.g. "4.2 \tLoad-bearing substructure" - two
// numbers, not three). If one of these falls inside a captured narrative
// span, it means an element-level heading was missed somewhere before it
// (see the module comment on the FB798 example: a report that merges two
// of spanSense's elements into one write-up loses an X.Y.Z heading, which
// shifts every element after it by one and lets the next category's own
// header bleed into the wrong element's narrative) - trim there instead
// of carrying it into the narrative text.
const CATEGORY_HEADING_RE = /^\d+\.\d+[ \t]+[A-Z]/m;

const NA_RE = /^(not\s*applicable|n\/?a)\.?$/i;

// Page footers/headers (page numbers, repeated doc title/file path lines)
// get flattened into the same text stream as the real content by PDF
// extraction, and can otherwise bleed into a narrative that happens to
// end right at a page boundary. Two passes: strip the near-universal
// "-- N of M --" page marker outright, then strip any OTHER line that
// repeats often enough to be boilerplate rather than substantive content
// (a real multi-page report repeats its own header/footer once per page;
// a threshold of 4 keeps this from ever touching genuine narrative text,
// which doesn't recur verbatim).
function stripPageFurniture(text) {
  const lines = text.split('\n');
  const counts = new Map();
  lines.forEach(line => {
    const key = line.trim();
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return lines
    .filter(line => !/^--\s*\d+\s*of\s*\d+\s*--$/i.test(line.trim()))
    .filter(line => {
      const key = line.trim();
      return !key || (counts.get(key) || 0) < 4;
    })
    .join('\n');
}

function classifyNarrative(rawText) {
  const text = (rawText || '').trim();
  // Blank (no heading matched at all - see the warning this triggers in
  // extractElements) is treated the same as an explicit "Not applicable" -
  // a normal-looking clear row is a lot less confusing to review than a
  // defect card with an empty narrative.
  if (!text || NA_RE.test(text.replace(/\s+/g, ' '))) {
    return { status: 'na' };
  }
  return {
    status: 'defect',
    defectDbId: null,
    defectType: '1',
    defectNumber: '1',
    severity: '1',
    extent: 'A',
    worksRequired: 'N',
    priority: null,
    cost: null,
    comments: text,
    remedialWorks: ''
  };
}

// elementRows: [{element_number, description}], already ordered by
// display_order ASC (same query /api/author/diff uses).
function extractElements(rawText, elementRows) {
  const text = stripPageFurniture(rawText);
  const headings = [];
  let match;
  HEADING_RE.lastIndex = 0;
  while ((match = HEADING_RE.exec(text)) !== null) {
    headings.push({ index: match.index, headingEnd: HEADING_RE.lastIndex, label: match[4].trim() });
  }

  const narratives = headings.map((h, i) => {
    const nextStart = i + 1 < headings.length ? headings[i + 1].index : text.length;
    let span = text.slice(h.headingEnd, nextStart);
    const categoryLeak = CATEGORY_HEADING_RE.exec(span);
    if (categoryLeak) span = span.slice(0, categoryLeak.index);
    return span.trim();
  });

  const elements = elementRows.map((row, i) => {
    const narrative = narratives[i]; // undefined if fewer headings were found than elements
    const classified = classifyNarrative(narrative || '');
    return {
      elementNumber: row.element_number,
      name: row.description,
      current: classified,
      previous: null,
      comparison: 'first'
    };
  });

  let warning = null;
  if (headings.length !== elementRows.length) {
    warning = `Found ${headings.length} numbered element sections in the document, but ${elementRows.length} are expected for this structure type - please review every card carefully, some may be missing or misaligned.`;
  }

  return { elements, warning };
}

module.exports = { extractElements };
