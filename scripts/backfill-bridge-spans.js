// One-off, idempotent migration: gives every bridge a real bridge_spans row
// per span, instead of relying on the structure-level length/width/material/
// form fields as a stand-in everywhere (Proforma, report, twinView, field
// app all did their own version of this fallback, inconsistently).
//
// bridges.primary_material/secondary_material/primary_form/secondary_form
// already store the same coded vocabulary as bridge_spans' *_code columns
// (single BCI Table 4 letter for material, 2-digit Table 2/3 code for form),
// so this is a direct copy, not a translation - confirmed by inspecting the
// live data, not just the schema. Per span:
//   - length = structure length / span_number, rounded to 1 decimal (an
//     even split - the true per-span breakdown isn't known, so this is a
//     "typical span" approximation, not a claim of precision)
//   - width, material, form = the same as every other span on that
//     structure (also unknown per-span, so a single shared value is the
//     honest default until someone edits a span with real data)
//
// Only touches bridges with zero existing bridge_spans rows - never
// overwrites/replaces spans someone already entered by hand. Safe to re-run
// (ON CONFLICT DO NOTHING on the bridge_id+span_number unique constraint).
//
// Run with: node scripts/backfill-bridge-spans.js
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const supabaseCA = fs.readFileSync(path.join(__dirname, '..', 'certs', 'supabase-ca.crt'), 'utf8');

async function main() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: true, ca: supabaseCA }
    });
    await client.connect();

    const { rows: bridges } = await client.query(`
        SELECT id, name, span_number, length, width,
               primary_material, secondary_material, primary_form, secondary_form
        FROM bridges
        ORDER BY id
    `);

    let skippedHasSpans = 0;
    let skippedMissingData = 0;
    let backfilled = 0;
    let rowsInserted = 0;

    for (const b of bridges) {
        const { rows: existing } = await client.query(
            'SELECT 1 FROM bridge_spans WHERE bridge_id = $1 LIMIT 1',
            [b.id]
        );
        if (existing.length) {
            console.log(`  skip (already has spans): #${b.id} ${b.name}`);
            skippedHasSpans++;
            continue;
        }

        const spanCount = b.span_number && b.span_number > 0 ? b.span_number : null;
        if (!spanCount || b.length == null) {
            console.log(`  skip (missing span_number/length): #${b.id} ${b.name}`);
            skippedMissingData++;
            continue;
        }

        const perSpanLength = Math.round((b.length / spanCount) * 10) / 10;

        for (let n = 1; n <= spanCount; n++) {
            await client.query(
                `INSERT INTO bridge_spans
                    (bridge_id, span_number, length, width, primary_form, primary_material_code, secondary_form, secondary_material_code)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (bridge_id, span_number) DO NOTHING`,
                [b.id, n, perSpanLength, b.width, b.primary_form, b.primary_material, b.secondary_form, b.secondary_material]
            );
            rowsInserted++;
        }
        console.log(`  backfilled: #${b.id} ${b.name} -> ${spanCount} span(s) @ ${perSpanLength}m each`);
        backfilled++;
    }

    console.log(
        `\nDone. Backfilled ${backfilled} bridge(s), ${rowsInserted} span row(s) inserted. ` +
        `Skipped ${skippedHasSpans} (already had spans), ${skippedMissingData} (missing span_number/length).`
    );

    await client.end();
}

main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
