// Extracts per-element narrative from a previous-inspection document using
// the Gemini API (free tier) - a semantic alternative to
// extractPreviousInspection.js's regex approach, which only works when the
// document's element headings are numbered exactly like spanSense's own
// "X.Y.Z <name>" convention in the same order. Real-world reports from
// other councils/consultants rarely match that exactly (different
// numbering, merged sections, tables that don't extract cleanly as text),
// so this matches each element by MEANING instead of heading position.
//
// server.js tries this first and falls back to the regex approach if it
// throws for any reason - missing/invalid key, free-tier quota, network,
// malformed response - so the upload flow still works either way.

// Alias, not a pinned version - gemini-2.0-flash has zero free-tier quota
// on the key this was set up with, and both gemini-1.5-flash and
// gemini-2.5-flash are already unavailable/deprecated, so a pinned version
// string here would go stale as Google's lineup shifts. Google keeps this
// alias pointed at their current recommended flash model.
const GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Comfortably under Gemini's context window for the free tier while
// covering every real inspection report this has been tried against -
// a cap mainly guards against an oversized/garbled PDF extraction blowing
// the request up, not against genuine reports being this long.
const MAX_TEXT_CHARS = 100000;

async function extractElementsWithGemini(rawText, elementRows) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    const elementList = elementRows.map(r => `${r.element_number}: ${r.description}`).join('\n');
    const text = (rawText || '').slice(0, MAX_TEXT_CHARS);

    const prompt = `You are extracting structured data from a UK bridge/structure inspection report, for the "Description of Defects" section.

Below is spanSense's own element list for this structure type, in order. For EACH element, read the uploaded document and find whatever it says about that specific element - match by MEANING/description, not by exact heading numbering or wording, since the document may use different section numbers or headings from spanSense's own convention.

Element list:
${elementList}

For each element in the list above, respond with:
- elementNumber: copied exactly from the element list
- status: "na" if the document says the element is not applicable, not present, nothing to report, or in good condition with no defect described - or if you cannot find anything about this element in the document at all
- status: "defect" if the document describes an actual condition, defect, or observation for that element
- narrative: the relevant text from the document for that element, verbatim or lightly cleaned up (not a summary) - only include this when status is "defect"

Document text:
"""
${text}
"""`;

    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: 'object',
                properties: {
                    elements: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                elementNumber: { type: 'string' },
                                status: { type: 'string', enum: ['na', 'defect'] },
                                narrative: { type: 'string' }
                            },
                            required: ['elementNumber', 'status']
                        }
                    }
                },
                required: ['elements']
            }
        }
    };

    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 300)}`);
    }
    const data = await res.json();
    const textOut = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
        data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
    if (!textOut) throw new Error('Gemini returned no content');
    const parsed = JSON.parse(textOut);

    const byNumber = new Map((parsed.elements || []).map(e => [String(e.elementNumber), e]));
    const elements = elementRows.map(row => {
        const match = byNumber.get(String(row.element_number));
        const current = (match && match.status === 'defect' && match.narrative)
            ? {
                status: 'defect', defectDbId: null, defectType: '1', defectNumber: '1',
                severity: '1', extent: 'A', worksRequired: 'N', priority: null, cost: null,
                comments: match.narrative, remedialWorks: ''
            }
            : { status: 'na' };
        return {
            elementNumber: row.element_number,
            name: row.description,
            current,
            previous: null,
            comparison: 'first'
        };
    });

    return { elements, warning: null };
}

module.exports = { extractElementsWithGemini };
