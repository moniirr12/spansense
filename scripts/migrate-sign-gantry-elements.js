// One-off, idempotent migration: seeds the Sign Gantry element list into
// the `elements` table, per Highways Agency Guidance Document for
// Performance Measurement of Highway Structures, Part B1, Table 11.
// The "Additional HA Element" (Road Restraint System) is intentionally
// left out, per the same treatment Retaining wall gave Anchoring System.
//
// Run with: node scripts/migrate-sign-gantry-elements.js
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const supabaseCA = fs.readFileSync(path.join(__dirname, '..', 'certs', 'supabase-ca.crt'), 'utf8');

const SIGN_GANTRY_ELEMENTS = [
    [1,  'Foundations', 1],
    [2,  'Truss/beams/cantilever', 2],
    [3,  'Transverse/horiz. bracing elements', 3],
    [4,  'Columns/supports/legs', 4],
    [5,  'Surface finishes: truss/beams/cantilever', 5],
    [6,  'Surface finishes: columns/supports/legs', 6],
    [7,  'Surface finishes: other elements', 7],
    [8,  'Access/walkway/deck', 8],
    [9,  'Access ladder', 9],
    [10, 'Handrails/guard rails', 10],
    [11, 'Base connections', 11],
    [12, 'Support to longitudinal connection', 12],
    [13, 'Sign and signal supports', 13],
    [14, 'Signs/signals', 14],
    [15, 'Lighting', 15],
    [16, 'Services', 16]
];

async function main() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: true, ca: supabaseCA }
    });
    await client.connect();

    console.log('Seeding Sign Gantry elements...');
    for (const [elementNumber, description, displayOrder] of SIGN_GANTRY_ELEMENTS) {
        await client.query(
            `INSERT INTO elements (element_number, description, structure_type, display_order)
             VALUES ($1, $2, 'Sign Gantry', $3)
             ON CONFLICT (structure_type, element_number) DO NOTHING`,
            [elementNumber, description, displayOrder]
        );
    }

    const count = await client.query(`SELECT COUNT(*) FROM elements WHERE structure_type = 'Sign Gantry'`);
    console.log(`Done. Sign Gantry elements: ${count.rows[0].count}`);

    await client.end();
}

main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
