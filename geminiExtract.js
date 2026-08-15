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

// Structure identification facts (name, location, dimensions, materials,
// built year) out of an uploaded BCI Pro forma or inspection report cover
// sheet - for structure/add-structure.html's "Extract from document"
// option, prefilling the form for a structure that doesn't exist in
// spanSense yet (unlike extractElementsWithGemini above, which matches
// against an existing structure's element list). Deliberately never asked
// for condition scores or the numeric BCI element table - see
// extractPreviousInspection.js's note on why that table doesn't extract
// reliably even for an existing structure; asking for it here would be
// worse; a wrong guess is worse than leaving a field blank for the user.
async function extractStructureInfoWithGemini(rawText) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    const text = (rawText || '').slice(0, MAX_TEXT_CHARS);
    const prompt = `You are extracting structure identification details from a UK bridge/structure BCI Pro forma or inspection report cover sheet. Read the document below and pull out whatever facts it states about the STRUCTURE ITSELF - not the inspection findings, condition scores, or defect table.

Respond with a JSON object with these fields. Use null for anything the document doesn't clearly state - do not guess or invent a value:
- name: the structure's name
- type: one of "bridge", "footbridge", "culvert", "retaining_wall", "sign_gantry" - infer from context if not stated explicitly, else null
- location: place name or address
- span: typical/individual span length in metres (a number)
- length: total structure length in metres (a number)
- width: deck/carriageway width in metres (a number)
- spanNumber: number of spans (an integer)
- builtYear: year built (an integer)
- loadCapacity: load rating in tonnes (a number)
- primaryMaterial: main construction material
- secondaryMaterial: secondary construction material, if any
- description: a short 1-2 sentence description of the structure, only if the document actually gives one
- ose: OS grid reference easting
- osn: OS grid reference northing

Do NOT extract condition scores, defect descriptions, or values from the numeric BCI element table - only the structure's own identifying facts, typically found on a cover sheet or header section.

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
                    name: { type: 'string', nullable: true },
                    type: { type: 'string', nullable: true },
                    location: { type: 'string', nullable: true },
                    span: { type: 'number', nullable: true },
                    length: { type: 'number', nullable: true },
                    width: { type: 'number', nullable: true },
                    spanNumber: { type: 'integer', nullable: true },
                    builtYear: { type: 'integer', nullable: true },
                    loadCapacity: { type: 'number', nullable: true },
                    primaryMaterial: { type: 'string', nullable: true },
                    secondaryMaterial: { type: 'string', nullable: true },
                    description: { type: 'string', nullable: true },
                    ose: { type: 'string', nullable: true },
                    osn: { type: 'string', nullable: true }
                }
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
    return JSON.parse(textOut);
}

// Shared by draftConclusionsWithGemini and reviseConclusionsWithGemini below
// so the "ask AI to adjust" follow-up is grounded in the same facts the
// original draft was, rather than trusting whatever the text drifted to.
function buildInspectionFactsBlock(summary) {
    const defects = Array.isArray(summary.defects) ? summary.defects : [];
    const defectLines = defects.map(d => {
        const bits = [`${d.element} (${d.code}): ${d.description || 'unspecified defect'}, severity ${d.severity}, extent ${d.extent}`];
        if (d.worksRequired === 'Y') bits.push('remedial works required');
        else if (d.worksRequired === 'M') bits.push('recommended for monitoring');
        if (d.comment) bits.push(`inspector's note: "${d.comment}"`);
        return `- ${bits.join(', ')}`;
    }).join('\n') || '(none recorded)';

    return `Structure type: ${summary.structureType || 'Bridge'}
Elements checked: ${summary.elementsChecked}
Elements with no defects: ${summary.noDefectsCount}
Elements that could not be inspected: ${summary.notInspectedCount}
Overall BCI average: ${summary.bciAv}, BCI critical: ${summary.bciCrit}

Defects recorded (most severe first):
${defectLines}`;
}

async function callGemini(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 300)}`);
    }
    const data = await res.json();
    const textOut = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
        data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
    if (!textOut) throw new Error('Gemini returned no content');
    return textOut.trim();
}

// Drafts the free-text "Conclusions" paragraph(s) for an inspection, from
// the same defect/BCI summary the client's own template-based
// generateDraftConclusions() uses (see inspection/spans.js) - this is an
// alternative source for that same "Suggest Draft" button, not a different
// feature. The client falls back to its local template if this throws for
// any reason (missing/invalid key, quota, network), same fallback shape as
// extractElementsWithGemini above.
async function draftConclusionsWithGemini(summary) {
    const prompt = `You are drafting the "Conclusions" section of a UK bridge/structure inspection report. Write in the plain, factual, third-person register used in real UK structures engineering reports - no marketing language, no headings, no bullet points in your answer, 2-4 short paragraphs of prose.

Inspection facts:
${buildInspectionFactsBlock(summary)}

Write the Conclusions section now: summarise overall condition and describe the most significant defects and their implications. Do not discuss or recommend remedial works - that's covered elsewhere in the report. Only use the facts given above - do not invent defects, dates, or figures not listed.`;

    return callGemini(prompt);
}

// The "ask AI to adjust" follow-up on an already-drafted (or inspector-
// written) Conclusions text - a targeted rewrite per the inspector's
// instruction, re-grounded in the original facts each time rather than
// letting errors/inventions compound across repeated edits.
async function reviseConclusionsWithGemini(currentText, instruction, summary) {
    const prompt = `You previously drafted this "Conclusions" section for a UK bridge/structure inspection report:

"""
${currentText}
"""

The inspector wants this change applied: "${instruction}"

Original inspection facts, for reference - the revised text must stay consistent with these, do not invent anything beyond what's here:
${buildInspectionFactsBlock(summary)}

Rewrite the Conclusions section applying the requested change, in the same plain, factual, third-person UK structures-report register - no marketing language, no headings, no bullet points. Do not discuss or recommend remedial works - that's covered elsewhere in the report. Return only the revised Conclusions text, with no commentary about what you changed.`;

    return callGemini(prompt);
}

// Static reference facts for the map.html chat assistant - a compact
// version of the same ground truth map.js's local CHAT_FAQ answers from,
// so the model stays consistent with the canned answers rather than
// improvising its own description of how the app works.
const APP_REFERENCE = `- New inspection: click a structure marker on the map, then "New Inspection" on its card. Step 1 sets type (GI/PI/SI), date, inspector; step 2 walks through each element to log defects.
- Defects: Severity 1 (Minor) to 5 (Emergency), Extent A (isolated) to E (extensive). A live BCI impact preview shows the effect before saving.
- BCI avg: condition across every inspected element, weighted by importance. BCI crit: only a fixed set of critical elements (e.g. main girders, bearings) for that structure type.
- BCI condition bands: Very Good 90-100, Good 80-89, Fair 65-79, Poor 40-64, Very Poor 0-39.
- Map: search bar jumps to a structure by name; sidebar filters narrow by type/condition.
- Previous Inspections (on a structure card): every past inspection for it, filterable by PI/GI/SI, with CRIT and AV scores.
- twinView: 3D model of a structure from its real span/condition data; Inspection History timeline shows past condition.
- Reports: generate an inspection PDF or BCI Proforma from Previous Inspections; export structure/inspection records as CSV/PDF/JSON/XML from Database.
- Planning: Month/Year/Gantt views of upcoming inspections; pencil icon sets a custom cycle or moves the next due date.
- Dashboard: portfolio-wide totals, high-risk structures, BCI averages, and a Pending Review queue for engineers/admins.
- Roles: Inspectors run inspections and view reports. Engineers also approve/reject inspections and edit schedules. Admins have full access.`;

// Turns a portfolio summary (see server.js's buildPortfolioSummary) into the
// facts block the chat assistant is grounded in - same "only use what's
// given, don't invent numbers" discipline as buildInspectionFactsBlock.
function buildPortfolioFactsBlock(summary) {
    const byType = Object.entries(summary.byType || {})
        .filter(([, count]) => count > 0)
        .map(([type, count]) => `${type.replace('_', ' ')}: ${count}`)
        .join(', ') || '(none)';

    const bands = summary.bciBands || {};
    const bandLine = `Very Good ${bands.veryGood || 0}, Good ${bands.good || 0}, Fair ${bands.fair || 0}, Poor ${bands.poor || 0}, Very Poor ${bands.veryPoor || 0}, not yet scored ${bands.unscored || 0}`;

    const overdueLines = (summary.overdue || []).slice(0, 8)
        .map(o => `- ${o.name} (${o.type} due, was due ${o.dueDate})`).join('\n') || '(none overdue)';

    const neverInspectedLines = (summary.neverInspected || []).slice(0, 8)
        .map(n => `- ${n}`).join('\n') || '(none)';

    return `Total structures: ${summary.totalStructures}
By type: ${byType}
Portfolio average BCI: ${summary.avgBci != null ? summary.avgBci.toFixed(1) : 'not available'}
BCI condition bands (count of structures in each): ${bandLine}

Overdue for inspection (${summary.overdue ? summary.overdue.length : 0} total, showing up to 8):
${overdueLines}

Never inspected (${summary.neverInspected ? summary.neverInspected.length : 0} total, showing up to 8):
${neverInspectedLines}`;
}

// The map.html chat assistant's live-data path - used when the client's
// local keyword-matched CHAT_FAQ (map.js) doesn't confidently match the
// question, so anything about "how do I..." still gets a fast free local
// answer and only genuinely open-ended or data-specific questions ("which
// structures are overdue", "what's my average BCI") reach here.
async function answerChatMessage(question, summary) {
    const prompt = `You are the in-app assistant for spanSense, a UK highway structures (bridges/culverts/retaining walls/sign gantries) inspection and asset management tool. Answer the user's question in 1-4 short sentences, plain factual tone, no markdown formatting, no headings, no bullet points.

Only use the reference facts and live portfolio data below - if the question asks for something neither section covers, say plainly that you don't have that information, rather than guessing or inventing a number.

How the app works:
${APP_REFERENCE}

Live portfolio data (current, from the database):
${buildPortfolioFactsBlock(summary)}

User's question: "${question}"

Answer now:`;

    return callGemini(prompt);
}

module.exports = { extractElementsWithGemini, extractStructureInfoWithGemini, draftConclusionsWithGemini, reviseConclusionsWithGemini, answerChatMessage };
