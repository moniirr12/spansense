// One-off, idempotent migration: adds structure-type-awareness to the
// `elements` table and seeds the Retaining Wall element list, validated
// against real official BCI proforma spreadsheets. Safe to re-run.
//
// Run with: node scripts/migrate-structure-types.js
require('dotenv').config();
const { Client } = require('pg');

const RETAINING_WALL_ELEMENTS = [
    [1, 'Foundations', 1],
    [2, 'Retaining wall: Primary', 2],
    [3, 'Retaining wall: Secondary', 3],
    [4, 'Parapet beam/plinth', 4],
    [5, 'Drainage', 5],
    [6, 'Movement/Expansion Joints', 6],
    [7, 'Surface finishes: wall', 7],
    [8, 'Surface finishes: handrail/parapet', 8],
    [9, 'Handrail/parapets/safety fences', 9],
    [10, 'Carriageway: Top of Wall', 10],
    [11, 'Carriageway: Foot of Wall', 11],
    [12, 'Footway/verge: Top of Wall', 12],
    [13, 'Footway/verge: Foot of Wall', 13],
    [14, 'Embankment', 14],
    [15, 'Superstructure drainage', 15],
    [16, 'Invert/river bed', 16],
    [17, 'Aprons', 17],
    [9001, 'Additional HA Element: Anchoring system', 18],
    [18, 'Signs', 19],
    [19, 'Lighting', 20],
    [20, 'Services', 21]
];

async function main() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    await client.connect();

    console.log('Adding structure_type/display_order columns (additive, IF NOT EXISTS)...');
    await client.query(`ALTER TABLE elements ADD COLUMN IF NOT EXISTS structure_type TEXT NOT NULL DEFAULT 'Bridge'`);
    await client.query(`ALTER TABLE elements ADD COLUMN IF NOT EXISTS display_order INTEGER`);
    await client.query(`UPDATE elements SET display_order = element_number WHERE display_order IS NULL`);

    console.log('Adding uniqueness constraint (skips if already present)...');
    await client.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'elements_type_number_uniq'
            ) THEN
                ALTER TABLE elements ADD CONSTRAINT elements_type_number_uniq UNIQUE (structure_type, element_number);
            END IF;
        END $$;
    `);

    console.log('Seeding Retaining wall elements...');
    for (const [elementNumber, description, displayOrder] of RETAINING_WALL_ELEMENTS) {
        await client.query(
            `INSERT INTO elements (element_number, description, structure_type, display_order)
             VALUES ($1, $2, 'Retaining wall', $3)
             ON CONFLICT (structure_type, element_number) DO NOTHING`,
            [elementNumber, description, displayOrder]
        );
    }

    const bridgeCount = await client.query(`SELECT COUNT(*) FROM elements WHERE structure_type = 'Bridge'`);
    const wallCount = await client.query(`SELECT COUNT(*) FROM elements WHERE structure_type = 'Retaining wall'`);
    console.log(`Done. Bridge elements: ${bridgeCount.rows[0].count}, Retaining wall elements: ${wallCount.rows[0].count}`);

    await client.end();
}

main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
