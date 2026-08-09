require("dotenv").config();
const express = require("express");
const { Pool, types } = require("pg");
// node-postgres's default DATE (OID 1082) parser converts to a JS Date at
// LOCAL midnight, which then serializes to JSON via toISOString() in UTC -
// on any server whose local timezone isn't UTC (this one runs in
// Europe/London/BST, UTC+1), that silently shifts every date back by a day
// (e.g. a stored '2022-05-30' round-trips as '2022-05-29T23:00:00.000Z').
// Returning the raw 'YYYY-MM-DD' string instead avoids the shift entirely.
types.setTypeParser(1082, val => val);
const bodyParser = require("body-parser");
const cors = require("cors");

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const proj4 = require('proj4');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const storage = require('./supabaseStorage');
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const { extractElements } = require('./extractPreviousInspection');
const { extractElementsWithGemini, extractStructureInfoWithGemini, draftConclusionsWithGemini, reviseConclusionsWithGemini } = require('./geminiExtract');

const router = express.Router();
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const rateLimit = require('express-rate-limit');

const app = express();
// Render terminates TLS at its own proxy and forwards plain HTTP internally -
// without this, Express sees every request as non-secure (req.secure is
// always false), which would make the session cookie's secure flag below
// never actually get set on the response.
app.set('trust proxy', 1);

// PostgreSQL connection - created before the session middleware below since
// that needs a pool to persist sessions against. rejectUnauthorized was
// previously false in production, which encrypts the connection but never
// checks it's actually Supabase's pooler on the other end (accepts any
// cert, so a MITM on that hop would go unnoticed). Pinning Supabase's own
// Root 2021 CA (certs/supabase-ca.crt - their public root, captured
// directly from a live handshake with our own DB, not a third-party copy)
// lets us verify the chain properly instead.
const supabaseCA = fs.readFileSync(path.join(__dirname, 'certs', 'supabase-ca.crt'), 'utf8');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true, ca: supabaseCA } : false
});

// Core middleware - MUST be registered before any route (app.get/post/etc.)
// below. Express only applies middleware to routes registered *after* it in
// the file, in literal call order - these three were previously registered
// far down the file (after most routes), so req.session was undefined,
// req.body was unparsed, and CORS headers were missing for every route
// defined above that point. That's what made requireAuth reject requests
// even with a valid session cookie attached.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors({
    origin: [
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'https://spansense.onrender.com'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.options('*', cors());
if (!process.env.SESSION_SECRET) {
    // Never fall back to a fixed string here - that's exactly the hardcoded-
    // secret problem this is meant to fix. A random per-boot value at least
    // means sessions just don't survive a restart instead of being forgeable
    // by anyone who's read the source.
    console.warn('[WARN] SESSION_SECRET is not set in the environment - generating a random one for this run. Sessions will not persist across restarts until SESSION_SECRET is configured (in .env locally, and in your hosting provider\'s environment variables for any deployed instance).');
}
const sessionSecret = process.env.SESSION_SECRET || require('crypto').randomBytes(48).toString('base64');

app.use(session({
    // MemoryStore (express-session's default) leaks memory and only works
    // within a single process - fine for local dev, not for anything with
    // real concurrent users or more than one server instance. Sessions live
    // in Postgres instead now, in a "session" table connect-pg-simple
    // creates for itself on first run.
    store: new pgSession({ pool: pool, tableName: 'session', createTableIfMissing: true }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        // Was hardcoded false, so the session ID was sendable over plain
        // HTTP even in production. localhost/127.0.0.1 are treated as secure
        // contexts by browsers regardless, so this doesn't affect local dev.
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    }
}));

// WGS84 (lat/long) -> OSGB36 / British National Grid (easting/northing).
// Standard EPSG:27700 definition with the published 7-parameter Helmert
// approximation - accurate to within a few metres across Great Britain,
// which is plenty for a proforma reference field (not survey-grade, which
// would need the OSTN15 grid shift instead).
proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +units=m +no_defs +towgs84=446.448,-125.157,542.060,0.1502,0.2470,0.8421,-20.4894');
function latLonToOSGB(lat, lon) {
    if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return null;
    var en = proj4('EPSG:4326', 'EPSG:27700', [Number(lon), Number(lat)]);
    return { easting: Math.round(en[0]), northing: Math.round(en[1]) };
}


// Full API route table - not called by any page in the app, just an
// introspection helper, so no reason for it to be readable by every logged-in
// account rather than admins specifically.
app.get('/api/routes', requireAuth, requireAdmin, (req, res) => {
    const routes = [];
    app._router.stack.forEach(middleware => {
        if (middleware.route) {
            routes.push(Object.keys(middleware.route.methods)[0].toUpperCase() + ' ' + middleware.route.path);
        } else if (middleware.name === 'router') {
            middleware.handle.stack.forEach(handler => {
                if (handler.route) {
                    routes.push(Object.keys(handler.route.methods)[0].toUpperCase() + ' ' + handler.route.path);
                }
            });
        }
    });
    res.json({ routes });
});

// Test connection on startup
pool.query('SELECT NOW()', (err, res) => {
    if (err) console.error('DB connection error:', err);
    else console.log('PostgreSQL connected');
});

// Helper functions for async/await database operations
function dbGet(query, params = []) {
    return new Promise((resolve, reject) => {
        pool.query(query, params, (err, result) => {
            if (err) reject(err);
            else resolve(result.rows[0] || null);
        });
    });
}

function dbAll(query, params = []) {
    return new Promise((resolve, reject) => {
        pool.query(query, params, (err, result) => {
            if (err) reject(err);
            else resolve(result.rows);
        });
    });
}

function dbRun(query, params = []) {
    return new Promise((resolve, reject) => {
        pool.query(query, params, (err, result) => {
            if (err) reject(err);
            else resolve({ lastID: result.rows[0]?.id || 0, changes: result.rowCount });
        });
    });
}

// Defense-in-depth for /save-inspection and /update-inspection: the real
// XSS fix is escaping on render (every consumer of structure_name/
// inspector_name/conclusions must do that regardless), but these short
// label fields never legitimately contain angle brackets, so stripping them
// on write closes the door even if some future render path forgets to
// escape. Not applied to conclusions - that's freeform inspection text that
// can legitimately contain "<"/">" (e.g. "crack width < 2mm"), so mangling
// it here would corrupt real engineering notes; it's capped for length
// instead and relies on render-time escaping like everything else does.
function stripAngleBrackets(str, maxLength) {
    if (str == null) return str;
    const cleaned = String(str).replace(/[<>]/g, '');
    return maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

// Initialize database tables
async function initDatabase() {
    try {
        // Users table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                full_name TEXT,
                role TEXT DEFAULT 'inspector',
                organization_id INTEGER,
                last_login TIMESTAMP
            )
        `);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
        // TOTP secret is written as soon as setup starts, before the user has
        // confirmed a code from their authenticator app - totp_enabled is the
        // actual gate on whether it's used at login, so an abandoned setup
        // just leaves an unused secret sitting here rather than half-enabling 2FA.
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT false`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path TEXT`);

        // Insert default admin user if table is empty
        const userCount = await dbGet("SELECT COUNT(*) as count FROM users");
        if (parseInt(userCount.count) === 0) {
            const defaultHash = await bcrypt.hash('admin123', 12);
            await pool.query(
                `INSERT INTO users (username, password, full_name, role)
                 VALUES ($1, $2, $3, $4)`,
                ['admin', defaultHash, 'System Admin', 'admin']
            );
            console.log('Default user created: admin / admin123');
        }

        // One-time migration: earlier versions stored passwords in plaintext.
        // bcrypt hashes always start with $2a$/$2b$/$2y$, so anything else
        // still needs hashing in place.
        const existingUsers = await dbAll('SELECT id, password FROM users');
        for (const u of existingUsers) {
            if (!/^\$2[aby]\$/.test(u.password)) {
                const hashed = await bcrypt.hash(u.password, 12);
                await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, u.id]);
                console.log('Migrated plaintext password for user id', u.id);
            }
        }

        // Bridges table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bridges (
                id SERIAL PRIMARY KEY,
                name TEXT,
                location TEXT,
                latitude DECIMAL,
                longitude DECIMAL,
                type TEXT,
                span INTEGER,
                length INTEGER,
                built_year INTEGER,
                span_number INTEGER,
                OSE TEXT,
                OSN TEXT,
                primary_material TEXT,
                secondary_material TEXT,
                organization_id INTEGER,
                photo_url TEXT,
                bci_av DECIMAL,
                last_inspection DATE
            )
        `);

        // Per-structure inspection scheduling: cycle length in years (falls back to
        // the standard 2yr GI / 6yr PI cadence when null) and an optional one-off
        // override for the next due date, set from the Planning page. GI and PI
        // share a single alternating slot (every pi_cycle_years/gi_cycle_years-th
        // occurrence is a PI instead of a GI, never both), so there's only one
        // override date, not one per type.
        await pool.query(`ALTER TABLE bridges ADD COLUMN IF NOT EXISTS gi_cycle_years INTEGER`);
        await pool.query(`ALTER TABLE bridges ADD COLUMN IF NOT EXISTS pi_cycle_years INTEGER`);
        await pool.query(`ALTER TABLE bridges ADD COLUMN IF NOT EXISTS next_inspection_override DATE`);

        // Free-text structure description - editable from inspection1.html's
        // "Span Info" panel (see PATCH /api/bridges/:id/info below).
        await pool.query(`ALTER TABLE bridges ADD COLUMN IF NOT EXISTS description TEXT`);

        // Carriageway/deck width (metres) and load rating (tonnes) - shown in
        // the map page's bridge modal. Not meaningful for a sign_gantry (it
        // spans over the carriageway rather than carrying vehicle load), so
        // that quick-info field reads "N/A" for that type instead of "--"
        // even once populated - see bcirep.js.
        await pool.query(`ALTER TABLE bridges ADD COLUMN IF NOT EXISTS width DECIMAL`);
        await pool.query(`ALTER TABLE bridges ADD COLUMN IF NOT EXISTS load_capacity DECIMAL`);

        // Optimistic-concurrency counter for PATCH /api/bridges/:id/info - lets
        // that endpoint detect two people editing the same structure's info
        // panel at once instead of whoever saves last silently overwriting the
        // other's fields. See the matching `version` column on inspections.
        await pool.query(`ALTER TABLE bridges ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1`);

        // Per-span geometry and deck construction - a structure's own
        // span/length/width columns above are just a "typical span"
        // shorthand (e.g. total length / span count), not real per-span
        // detail. Deck form/material genuinely don't have a meaningful
        // whole-bridge value the way length/width sort of do - a widened
        // structure can easily have an original masonry span next to a
        // later concrete one - so there's no bridges-level fallback for
        // those two, only per-span. Codes are the real UK BCI Pro forma
        // ones (Tables 2/3/4 of the GI codes standard): primary_form is
        // Table 2 (2-digit, e.g. "08"), secondary_form is Table 3
        // (2-digit), *_material_code is Table 4 (single letter, e.g. "B").
        // Rows are optional per span - Add Structure lets any of these be
        // left blank - and the whole table is optional per structure;
        // nothing else in the app requires it to have rows.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bridge_spans (
                id SERIAL PRIMARY KEY,
                bridge_id INTEGER NOT NULL,
                span_number INTEGER NOT NULL,
                length DECIMAL,
                width DECIMAL,
                primary_form TEXT,
                primary_material_code TEXT,
                secondary_form TEXT,
                secondary_material_code TEXT,
                UNIQUE(bridge_id, span_number)
            )
        `);

        // Inspections table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS inspections (
                id SERIAL PRIMARY KEY,
                structure_id INTEGER,
                structure_name TEXT,
                inspection_date DATE,
                inspection_type TEXT,
                inspector_name TEXT,
                total_spans INTEGER,
                conclusions TEXT,
                overall_bcicrit DECIMAL,
                overall_bciave DECIMAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Review/approval workflow: an inspector's save is 'submitted' by
        // default, an engineer then flips it to 'approved'/'rejected' and
        // leaves a comment (see requireEngineer + /api/inspections routes).
        await pool.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'submitted'`);
        await pool.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS reviewed_by TEXT`);
        await pool.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP`);
        await pool.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS engineer_comments TEXT`);

        // Optimistic-concurrency counter for PUT /update-inspection - every
        // save there deletes and reinserts every span/defect row from the
        // client's in-memory copy, so without this, two people editing the
        // same inspection at once means whoever saves second silently wipes
        // out whatever the first person just added. See the matching
        // `version` column on bridges.
        await pool.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1`);

        // Idempotency key for /save-inspection - Field generates one per
        // save attempt and resends the same one on every retry of that
        // attempt (see doSave/submitJob in field/js/app.js). On a flaky
        // connection the request can succeed on the server while the
        // response never reaches the client, which looks identical to a
        // failure - without this, the client's retry would create a second,
        // fully-duplicate inspection. A partial unique index (only enforced
        // when a key is actually present) leaves desktop saves, which never
        // send one, unaffected.
        await pool.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS client_submission_id TEXT`);
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_inspections_client_submission_id
            ON inspections (client_submission_id) WHERE client_submission_id IS NOT NULL
        `);

        // Tags which client saved this inspection - 'desktop' (the existing
        // full inspection1.html flow) or 'field' (spanSense Field's phone
        // capture flow). Lets reviewers tell a quick on-site draft apart
        // from a fully-authored desktop entry at a glance.
        await pool.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'desktop'`);

        // Inspection spans table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS inspection_spans (
                id SERIAL PRIMARY KEY,
                inspection_id INTEGER,
                span_number INTEGER,
                elements_inspected BOOLEAN,
                photographs_taken BOOLEAN,
                comments TEXT,
                bci_crit DECIMAL,
                bci_av DECIMAL
            )
        `);

        // Defects table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS defects (
                id SERIAL PRIMARY KEY,
                inspection_id INTEGER,
                span_number INTEGER,
                element_no INTEGER,
                element_description TEXT,
                defect_no INTEGER,
                defect_type TEXT,
                defect_number TEXT,
                severity TEXT,
                extent TEXT,
                works_required TEXT,
                priority TEXT,
                cost DECIMAL,
                comments TEXT,
                remedial_works TEXT,
                timestamp TIMESTAMP
            )
        `);

        // Twin view 3D position (nullable until set via the future defect-placement
        // interface; twin.js only renders defects that have these set)
        await pool.query(`ALTER TABLE defects ADD COLUMN IF NOT EXISTS pos_x DECIMAL`);
        await pool.query(`ALTER TABLE defects ADD COLUMN IF NOT EXISTS pos_y DECIMAL`);
        await pool.query(`ALTER TABLE defects ADD COLUMN IF NOT EXISTS pos_z DECIMAL`);

        // Which defect counts for BCI scoring when an element has more than
        // one (see setAsPrimaryDefect in inspection.js)
        await pool.query(`ALTER TABLE defects ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE`);

        // Defect photos table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS defect_photos (
                id SERIAL PRIMARY KEY,
                defect_id INTEGER,
                photo_url TEXT,
                photo_description TEXT,
                display_order INTEGER,
                front_defectid TEXT,
                file_name TEXT,
                file_size INTEGER,
                file_type TEXT,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // General site photos (not tied to any defect) attach directly to the
        // inspection instead - defect_id stays NULL for these, inspection_id
        // stays NULL for a normal defect photo.
        await pool.query(`ALTER TABLE defect_photos ADD COLUMN IF NOT EXISTS inspection_id INTEGER`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_defect_photos_inspection_id ON defect_photos(inspection_id)`);

        // Notes log - short, unpolished, multi-entry log of things worth
        // flagging for whoever picks this inspection up next, separate from
        // `inspections.conclusions` (the single polished narrative summary).
        // 'source' distinguishes a note captured on site (Field) from one
        // added back at the desk (Core) - both land in the same log.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS inspection_notes (
                id SERIAL PRIMARY KEY,
                inspection_id INTEGER NOT NULL,
                text TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'core',
                author TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_inspection_notes_inspection_id ON inspection_notes(inspection_id)`);

        // Maintenance history - user-editable log of work carried out on a
        // structure (repairs, routine upkeep, etc.), shown/edited from
        // twinView. Deliberately separate from inspections/defects - this
        // is a record of WORK DONE, not a condition assessment, and isn't
        // tied to any particular inspection.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS maintenance_history (
                id SERIAL PRIMARY KEY,
                structure_id INTEGER NOT NULL,
                date DATE NOT NULL,
                category TEXT DEFAULT 'other',
                title TEXT NOT NULL,
                description TEXT,
                created_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Elements table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS elements (
                id SERIAL PRIMARY KEY,
                element_number INTEGER,
                description TEXT
            )
        `);

        // Folders table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS folders (
                id SERIAL PRIMARY KEY,
                name TEXT,
                parent_id INTEGER,
                bridge_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Files table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS files (
                id SERIAL PRIMARY KEY,
                name TEXT,
                filepath TEXT,
                size INTEGER,
                mime_type TEXT,
                folder_id INTEGER,
                bridge_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Author branding: one row per organization, keyed the same loose
        // way organization_id is used everywhere else in this app (no real
        // `organizations` table exists yet). Reused automatically for every
        // report Author generates for that org, not re-picked per report.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS author_branding (
                organization_id INTEGER PRIMARY KEY,
                accent_color TEXT DEFAULT '#5b8c8a',
                template TEXT DEFAULT 'modern',
                logo_path TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('All tables initialized');

        // Row-Level Security must be enabled per table - Supabase's
        // auto-generated PostgREST API exposes any public table with RLS
        // off to anyone holding the project's anon key, completely
        // bypassing this app's own requireAuth/requireAdmin middleware
        // (a real incident: Supabase flagged this exact thing across every
        // table here, including users - password hashes, TOTP secrets).
        // This app's own pg.Pool connection is unaffected either way - it
        // runs as the postgres role, which bypasses RLS by design - so
        // enabling this can't break anything server.js does. Idempotent,
        // safe to run on every startup: this used to be a one-off fix made
        // directly in the Supabase dashboard, which a fresh deployment (new
        // project, disaster recovery) would silently miss entirely.
        await enableRowLevelSecurity();

        // Auto-resync all SERIAL sequences to prevent duplicate key errors
        await resyncSequences();

    } catch (err) {
        console.error('Database initialization error:', err);
    }
}

async function enableRowLevelSecurity() {
    const tables = [
        'users', 'bridges', 'inspections', 'inspection_spans', 'defects',
        'defect_photos', 'maintenance_history', 'elements', 'folders',
        'files', 'author_branding', 'session'
    ];
    for (const table of tables) {
        try {
            await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
        } catch (err) {
            // Non-fatal by design - e.g. connect-pg-simple's session table is
            // created lazily and may not exist yet on a brand-new database;
            // this just re-applies cleanly on the next startup once it does.
            console.error(`Failed to enable RLS on ${table}:`, err.message);
        }
    }
}

// Auto-resync all SERIAL sequences to MAX(id) + 1
async function resyncSequences() {
    const sequences = [
        { table: 'inspections', seq: 'inspections_id_seq' },
        { table: 'inspection_spans', seq: 'inspection_spans_id_seq' },
        { table: 'defects', seq: 'defects_id_seq' },
        { table: 'defect_photos', seq: 'defect_photos_id_seq' },
        { table: 'elements', seq: 'elements_id_seq' },
        { table: 'folders', seq: 'folders_id_seq' },
        { table: 'files', seq: 'files_id_seq' },
        { table: 'users', seq: 'users_id_seq' },
        { table: 'bridges', seq: 'bridges_id_seq' }
    ];

    for (const { table, seq } of sequences) {
        try {
            await pool.query(`
                SELECT setval($1, COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)
            `, [seq]);
        } catch (err) {
            // Sequence might not exist yet if table is empty, that's fine
            console.log(`[SEQ] ${seq}: ${err.message}`);
        }
    }
    console.log('[SEQ] All sequences resynced');
}

initDatabase();

// GET type distribution counts
app.get('/api/bridges/type-distribution', requireAuth, async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT type, COUNT(*) as count 
            FROM bridges 
            GROUP BY type
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint to fetch the photo URL for a bridge
app.get('/getBridgePhoto', requireAuth, async (req, res) => {
    try {
        const bridgeId = req.query.bridgeId;
        const row = await dbGet("SELECT photo_url FROM bridges WHERE id = $1", [bridgeId]);
        if (!row) {
            return res.status(404).json({ error: 'Bridge not found' });
        }
        // photo_url stores a storage path (bucket is private), not a servable
        // URL directly - sign it fresh here, same convention as the other
        // storage-backed photo reads (inspection-photos, branding logo).
        res.json({ photo_url: await storage.getSignedUrl(row.photo_url) });
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Get unique inspection dates (and type) for a bridge
app.get('/api/inspection-dates/:structureId', requireAuth, async (req, res) => {
    try {
        const { structureId } = req.params;
        const rows = await dbAll(`
            SELECT DISTINCT
                inspection_date as date,
                COALESCE(inspection_type, 'Inspection') as type,
                source
            FROM inspections
            WHERE structure_id = $1
            ORDER BY inspection_date DESC
        `, [structureId]);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching inspection dates:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get elements of the table in inspection.html
// Structure types with their own distinct row in the `elements` table.
// Any other type (Footbridge, Culvert, ...) uses the Bridge list - they
// share the same BCI methodology (same importance mapping/critical elements
// in inspection/bci.js's STRUCTURE_TYPE_CONFIG too).
const SEEDED_ELEMENT_TYPES = ["Bridge", "Retaining wall", "Sign Gantry"];
function resolveElementsType(requestedType) {
    return SEEDED_ELEMENT_TYPES.includes(requestedType) ? requestedType : "Bridge";
}

// Add to your Node.js server
app.get("/api/defects-by-date", requireAuth, async (req, res) => {
    try {
        const { structure_number, date } = req.query;
        const rows = await dbAll(`
            SELECT
                d.id,
                d.span_number,
                d.element_no,
                d.element_description,
                d.defect_no,
                d.defect_type,
                d.defect_number,
                d.severity,
                d.extent,
                d.works_required,
                d.remedial_works,
                d.priority,
                d.cost,
                d.comments,
                d.timestamp,
                d.pos_x, d.pos_y, d.pos_z,
                s.bci_crit,
                s.bci_av
            FROM defects d
            JOIN inspections i ON d.inspection_id = i.id
            JOIN inspection_spans s ON d.inspection_id = s.inspection_id AND d.span_number = s.span_number
            WHERE i.structure_id = $1
            AND i.inspection_date = $2
            ORDER BY d.span_number, d.element_no, d.defect_no
        `, [structure_number, date]);

        const transformed = rows.map(row => ({
            defectDbId: row.id,
            span_number: row.span_number,
            element_no: row.element_no,
            def: `${row.defect_type}.${row.defect_number}`,
            s: row.severity,
            ex: row.extent,
            w: row.works_required ? 'Yes' : 'No',
            remedial_works: row.remedial_works || '',
            p: row.priority,
            cost: row.cost,
            comments_remarks: row.comments,
            bci_crit: row.bci_crit,
            bci_av: row.bci_av,
            timestamp: row.timestamp,
            // 3D twinView placement (see inspection/locate3d.js) - copying this
            // defect into a new inspection (see .btn-edit's "Copy" handler in
            // inspection.js) carries the location across too, when it has one.
            pos_x: row.pos_x !== null ? parseFloat(row.pos_x) : null,
            pos_y: row.pos_y !== null ? parseFloat(row.pos_y) : null,
            pos_z: row.pos_z !== null ? parseFloat(row.pos_z) : null
        }));

        res.json(transformed);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/get-spans', requireAuth, async (req, res) => {
    try {
        const bridgeId = parseInt(req.query.bridgeId, 10);
        if (isNaN(bridgeId)) {
            return res.status(400).json({ error: 'Invalid Bridge ID' });
        }
        const row = await dbGet('SELECT span_number FROM bridges WHERE id = $1', [bridgeId]);
        if (!row) {
            return res.status(404).json({ error: 'Bridge not found' });
        }
        res.json({ span_number: row.span_number });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Endpoint to fetch previous inspections for a specific structure
app.get('/api/previousInspections', requireAuth, async (req, res) => {
    try {
        const { structureId } = req.query;
        if (!structureId) {
            return res.status(400).json({ success: false, message: 'structureId is required' });
        }

        const rows = await dbAll(`
            SELECT 
                i.id,
                i.structure_id,
                i.structure_name,
                i.inspection_date, 
                i.inspection_type, 
                i.inspector_name,
                i.total_spans,
                i.created_at,
                i.overall_bcicrit,
                i.overall_bciave,
                STRING_AGG(DISTINCT sp.bci_crit::text, ',') AS bci_crit_values,
                STRING_AGG(DISTINCT sp.bci_av::text, ',') AS bci_av_values
            FROM inspections i
            LEFT JOIN inspection_spans sp ON i.id = sp.inspection_id
            WHERE i.structure_id = $1
            GROUP BY i.id
            ORDER BY i.inspection_date DESC
        `, [structureId]);

        const documents = rows.map(row => {
            const critValues = row.bci_crit_values 
                ? row.bci_crit_values.split(',').map(Number) 
                : [];
            const avValues = row.bci_av_values 
                ? row.bci_av_values.split(',').map(Number) 
                : [];

            const bci_crit = critValues.length > 0 
                ? Math.max(...critValues)
                : null;
            const bci_av = avValues.length > 0 
                ? avValues.reduce((a,b)=>a+b,0)/avValues.length 
                : null;

            return {
                id: row.id,
                structure_id: row.structure_id,
                structure_name: row.structure_name,
                date: row.inspection_date,
                inspection_type: row.inspection_type,
                inspector_name: row.inspector_name,
                total_spans: row.total_spans,
                created_at: row.created_at,
                bci_crit: row.overall_bcicrit || bci_crit,
                bci_av: row.overall_bciave || bci_av,
                overall_bcicrit: row.overall_bcicrit,
                overall_bciave: row.overall_bciave
            };
        });

        res.json({ success: true, documents });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// API endpoint to fetch elements
app.get('/api/elements', requireAuth, async (req, res) => {
    try {
        const structureType = resolveElementsType(req.query.type || 'Bridge');
        const rows = await dbAll(
            'SELECT element_number, description FROM elements WHERE structure_type = $1 ORDER BY display_order ASC',
            [structureType]
        );
        // no/severity/extent/defect are kept alongside element_number for callers
        // that render this straight into an inspection table row (formerly served
        // by the separate /get_elements route, now merged into this one).
        res.json(rows.map(row => ({
            element_number: row.element_number,
            no: row.element_number,
            description: row.description,
            severity: "",
            extent: "",
            defect: ""
        })));
    } catch (err) {
        console.error('Error fetching elements:', err);
        res.status(500).json({ error: 'Failed to fetch elements' });
    }
});

// In your API route handler
app.get('/api/defectsbci', requireAuth, async (req, res) => {
    try {
        const { structureId, date } = req.query;

        const inspectionQuery = `
            SELECT id, inspection_date, inspector_name, inspection_type FROM inspections
            WHERE structure_id = $1
            ${date ? 'AND inspection_date = $2' : ''}
        `;
        const inspectionParams = date ? [structureId, date] : [structureId];

        const inspections = await dbAll(inspectionQuery, inspectionParams);

        if (!inspections || inspections.length === 0) {
            return res.json([]);
        }

        // Next inspection due (see computeNextDue - GI/PI share one alternating
        // slot). Computed relative to *this* inspection's date (using only
        // history up to and including it) so reprinting an older form still
        // shows what was next due at that point, not relative to today - so
        // no next_inspection_override here, that's a "right now" correction.
        const allInspections = await dbAll(
            `SELECT inspection_date, inspection_type FROM inspections
             WHERE structure_id = $1 ORDER BY inspection_date ASC`,
            [structureId]
        );
        const bridgeSchedule = await dbGet(
            'SELECT gi_cycle_years, pi_cycle_years FROM bridges WHERE id = $1',
            [structureId]
        );
        const thisInspectionDate = new Date(inspections[0].inspection_date);
        const priorInspections = allInspections.filter(i => new Date(i.inspection_date) <= thisInspectionDate);
        const nextDue = computeNextDue(bridgeSchedule, priorInspections, null);
        const nextInspection = nextDue
            ? `${nextDue.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} ${nextDue.type}`
            : null;

        const inspectionIds = inspections.map(i => i.id);
        const placeholders = inspectionIds.map((_, i) => `$${i + 1}`).join(',');

        const spans = await dbAll(`
            SELECT 
                s.inspection_id,
                s.span_number,
                s.elements_inspected,
                s.photographs_taken,
                s.comments,
                s.bci_crit,
                s.bci_av,
                i.inspection_date,
                i.inspector_name,
                i.inspection_type,
                i.status,
                i.reviewed_by,
                i.reviewed_at,
                i.engineer_comments
            FROM inspection_spans s
            JOIN inspections i ON s.inspection_id = i.id
            WHERE s.inspection_id IN (${placeholders})
        `, inspectionIds);

        const defects = await dbAll(`
            SELECT 
                d.inspection_id,
                d.span_number,
                d.element_no,
                d.element_description,
                d.defect_no,
                d.severity AS s,
                d.extent AS ex,
                d.defect_type AS def,
                d.defect_number AS defn,
                d.works_required AS w,
                d.priority AS p,
                d.cost,
                d.comments AS comments_remarks,
                d.is_primary,
                i.inspection_date
            FROM defects d
            JOIN inspections i ON d.inspection_id = i.id
            WHERE d.inspection_id IN (${placeholders})
        `, inspectionIds);

        const result = spans.map(span => {
            const spanDefects = defects.filter(d =>
                d.inspection_id === span.inspection_id &&
                d.span_number === span.span_number
            );
            return { ...span, defects: spanDefects, next_inspection: nextInspection };
        });

        res.json(result);
    } catch (error) {
        console.error('[API] Error in defectsbci endpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET ALL BRIDGES (with last inspection date)
app.get('/api/bridges', requireAuth, async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT b.id, b.name, b.location, b.latitude, b.longitude, b.span, b.length,
                    b.built_year, b.type, b.span_number, b.OSE, b.OSN,
                    b.primary_material, b.secondary_material, b.organization_id,
                    latest_insp.overall_bciave AS bci_av,
                    b.gi_cycle_years, b.pi_cycle_years, b.next_inspection_override,
                    MAX(i.inspection_date) as last_inspected
            FROM bridges b
            LEFT JOIN inspections i ON b.id = i.structure_id
            LEFT JOIN LATERAL (
                SELECT overall_bciave
                FROM inspections
                WHERE structure_id = b.id
                ORDER BY inspection_date DESC
                LIMIT 1
            ) latest_insp ON true
            GROUP BY b.id, b.name, b.location, b.latitude, b.longitude, b.span, b.length,
                     b.built_year, b.type, b.span_number, b.OSE, b.OSN,
                     b.primary_material, b.secondary_material, b.organization_id,
                     latest_insp.overall_bciave,
                     b.gi_cycle_years, b.pi_cycle_years, b.next_inspection_override
            ORDER BY b.name
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update a structure's inspection scheduling (Planning page "Edit Schedule").
// Engineer/admin only, same gating as review/approve — this changes when
// inspections are due for everyone, not just a personal preference.
app.patch('/api/bridges/:id/schedule', requireAuth, requireEngineer, async (req, res) => {
    try {
        const { giCycleYears, piCycleYears, nextInspectionOverride } = req.body;

        const toIntOrNull = v => (v === null || v === undefined || v === '') ? null : parseInt(v, 10);
        const giYears = toIntOrNull(giCycleYears);
        const piYears = toIntOrNull(piCycleYears);
        if (giYears !== null && (!Number.isFinite(giYears) || giYears <= 0)) {
            return res.status(400).json({ success: false, error: 'giCycleYears must be a positive number' });
        }
        if (piYears !== null && (!Number.isFinite(piYears) || piYears <= 0)) {
            return res.status(400).json({ success: false, error: 'piCycleYears must be a positive number' });
        }
        const overrideDate = nextInspectionOverride || null;

        await pool.query(
            `UPDATE bridges SET gi_cycle_years = $1, pi_cycle_years = $2, next_inspection_override = $3 WHERE id = $4`,
            [giYears, piYears, overrideDate, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Update bridge schedule error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Shared by POST /api/bridges (create) and PUT /api/bridges/:id/spans
// (replace) below - always the full set for a structure, never a partial
// patch, so span_number (set by the caller right after this) can never
// drift out of sync with how many rows actually exist here.
async function replaceBridgeSpans(bridgeId, spans) {
    await pool.query('DELETE FROM bridge_spans WHERE bridge_id = $1', [bridgeId]);
    if (!spans || !spans.length) return;
    const cols = 8;
    const values = [];
    const rows = spans.map((s, i) => {
        const base = i * cols;
        values.push(
            bridgeId, i + 1,
            (s.length !== null && s.length !== undefined && s.length !== '') ? s.length : null,
            (s.width !== null && s.width !== undefined && s.width !== '') ? s.width : null,
            s.primaryForm || null, s.primaryMaterialCode || null,
            s.secondaryForm || null, s.secondaryMaterialCode || null
        );
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8})`;
    });
    await pool.query(
        `INSERT INTO bridge_spans (bridge_id, span_number, length, width, primary_form, primary_material_code, secondary_form, secondary_material_code)
         VALUES ${rows.join(',')}`,
        values
    );
}

// Create a new structure - structure/add-structure.html's "Create Structure"
// posts here. Engineer/admin only, same gating as schedule edits above -
// this adds a record everyone else sees on Map/Database/Planning.
app.post('/api/bridges', requireAuth, requireEngineer, async (req, res) => {
    try {
        const {
            name, type, location, latitude, longitude, span, length, width,
            span_number, built_year, load_capacity, primary_material,
            secondary_material, description, OSE, OSN, gi_cycle_years, pi_cycle_years, spans
        } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'name is required' });
        }

        // A filled-in per-span breakdown is the more specific figure - it
        // wins over the plain span_number stepper value when both arrive
        // (Add Structure always sends both; span_number alone is what
        // older/simpler callers still send).
        const spanNumber = (Array.isArray(spans) && spans.length) ? spans.length : (span_number ?? null);

        const row = await dbGet(
            `INSERT INTO bridges (
                name, type, location, latitude, longitude, span, length, width,
                span_number, built_year, load_capacity, primary_material,
                secondary_material, description, OSE, OSN, gi_cycle_years, pi_cycle_years,
                organization_id
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
             RETURNING id`,
            [
                name.trim(), type || null, location || null, latitude ?? null, longitude ?? null,
                span ?? null, length ?? null, width ?? null, spanNumber, built_year ?? null,
                load_capacity ?? null, primary_material || null, secondary_material || null,
                description || null, OSE || null, OSN || null, gi_cycle_years ?? null, pi_cycle_years ?? null,
                req.session.organizationId ?? null
            ]
        );
        if (Array.isArray(spans) && spans.length) await replaceBridgeSpans(row.id, spans);
        res.json({ success: true, id: row.id });
    } catch (err) {
        console.error('Create bridge error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Per-span geometry and BCI Pro forma deck construction codes - see
// bridge_spans' table comment in initDatabase() for why form/material
// don't get a bridges-level fallback the way length/width otherwise
// would. PUT always replaces the full set and derives span_number from
// the array's length/order, so bridges.span_number can't drift out of
// sync with what's actually been detailed here.
app.get('/api/bridges/:id/spans', requireAuth, async (req, res) => {
    try {
        const rows = await dbAll(
            `SELECT span_number, length, width, primary_form, primary_material_code, secondary_form, secondary_material_code
             FROM bridge_spans WHERE bridge_id = $1 ORDER BY span_number`,
            [req.params.id]
        );
        res.json(rows.map(r => ({
            spanNumber: r.span_number, length: r.length, width: r.width,
            primaryForm: r.primary_form, primaryMaterialCode: r.primary_material_code,
            secondaryForm: r.secondary_form, secondaryMaterialCode: r.secondary_material_code
        })));
    } catch (err) {
        console.error('Get bridge spans error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.put('/api/bridges/:id/spans', requireAuth, requireEngineer, async (req, res) => {
    try {
        const spans = Array.isArray(req.body.spans) ? req.body.spans : [];
        await replaceBridgeSpans(req.params.id, spans);
        await pool.query('UPDATE bridges SET span_number = $1 WHERE id = $2', [spans.length, req.params.id]);
        res.json({ success: true, spanNumber: spans.length });
    } catch (err) {
        console.error('Update bridge spans error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

const uploadStructurePhoto = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed'), false);
    }
});

// Cover photo for a structure - same single photo_url column map.js's
// bridge modal already reads via GET /getBridgePhoto below. Only the first
// photo picked in Add Structure's photo grid becomes this; there's no
// multi-photo gallery for structures the way inspections have one.
app.post('/api/bridges/:id/photo', requireAuth, requireEngineer,
    (req, res, next) => {
        uploadStructurePhoto.single('photo')(req, res, (err) => {
            if (!err) return next();
            if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Photo exceeds the 15MB limit.' });
            return res.status(400).json({ error: err.message });
        });
    },
    async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'No photo provided' });
            const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
            const storagePath = `bridges/bridge_${req.params.id}/cover_${Date.now()}.${ext}`;
            await storage.uploadFile(storagePath, req.file.buffer, req.file.mimetype);
            await pool.query('UPDATE bridges SET photo_url = $1 WHERE id = $2', [storagePath, req.params.id]);
            res.json({ success: true });
        } catch (err) {
            console.error('Upload structure photo error:', err);
            res.status(500).json({ error: err.message });
        }
    }
);

// GET RECENT ACTIVITY — latest inspections across all structures
app.get('/api/activity', requireAuth, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const rows = await dbAll(`
            SELECT i.id, i.structure_name, i.inspection_date, i.inspection_type,
                   i.inspector_name, i.overall_bciave AS bci_av, i.overall_bcicrit
            FROM inspections i
            WHERE i.inspection_date IS NOT NULL
            ORDER BY i.inspection_date DESC
            LIMIT $1
        `, [limit]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET previous defects for a specific element across all prior inspections
app.get('/api/previous-defects', requireAuth, async (req, res) => {
    try {
        const { structureId, elementNo } = req.query;
        if (!structureId || !elementNo) return res.status(400).json({ error: 'structureId and elementNo required' });
        const rows = await dbAll(`
            SELECT d.id, d.defect_type, d.defect_number, d.severity, d.extent,
                   d.works_required, d.remedial_works, d.priority, d.cost, d.comments,
                   d.element_description,
                   i.inspection_date, i.inspector_name
            FROM defects d
            JOIN inspections i ON d.inspection_id = i.id
            WHERE i.structure_id = $1 AND d.element_no = $2
            ORDER BY i.inspection_date DESC, d.defect_no
        `, [structureId, parseInt(elementNo)]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET every defect from a structure's most recent inspection, in one call
// (all elements, not just one) - used by inspection1.js to carry defects
// forward into a brand new inspection, coordinates included, so the
// inspector isn't re-placing 3D markers for defects that haven't moved
// since last time.
app.get('/api/latest-defects', requireAuth, async (req, res) => {
    try {
        const { structureId } = req.query;
        if (!structureId) return res.status(400).json({ error: 'structureId required' });

        const latest = await dbGet(
            `SELECT id, inspection_date FROM inspections
             WHERE structure_id = $1 ORDER BY inspection_date DESC, id DESC LIMIT 1`,
            [structureId]
        );
        if (!latest) return res.json({ inspectionDate: null, defects: [] });

        const rows = await dbAll(
            `SELECT span_number, element_no, element_description, defect_type, defect_number,
                    severity, extent, works_required, priority, cost, comments, remedial_works,
                    pos_x, pos_y, pos_z, is_primary
             FROM defects WHERE inspection_id = $1
             ORDER BY span_number, element_no`,
            [latest.id]
        );
        res.json({ inspectionDate: latest.inspection_date, defects: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get complete bridge data (PostgreSQL version)
app.get('/api/bridges/:id', requireAuth, async (req, res) => {
    try {
        const row = await dbGet('SELECT * FROM bridges WHERE id = $1', [req.params.id]);
        if (!row) {
            return res.status(404).json({ error: 'Bridge not found' });
        }
        // Fill in OSE/OSN from lat/long when not already recorded.
        if ((row.ose == null || row.osn == null) && row.latitude != null && row.longitude != null) {
            const osgb = latLonToOSGB(row.latitude, row.longitude);
            if (osgb) {
                if (row.ose == null) row.ose = osgb.easting;
                if (row.osn == null) row.osn = osgb.northing;
            }
        }
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Updates the structure facts inspection1.html's "Span Info" panel lets an
// inspector correct inline - the same fields Add Structure captures at
// creation (minus per-span breakdown, photos, OS grid and GI/PI cycle,
// which stay Database/Planning-page-only), reusing its type values and
// material option list. Primary/secondary material are separate columns
// here (unlike the old combined-string version of this endpoint), so
// neither gets silently cleared by editing the other.
app.patch('/api/bridges/:id/info', requireAuth, async (req, res) => {
    try {
        const {
            name, type, location, latitude, longitude, description,
            span_number, length, width, built_year, load_capacity,
            primary_material, secondary_material, version
        } = req.body;
        if (!name || !String(name).trim()) {
            return res.status(400).json({ error: 'name is required' });
        }
        // Optimistic concurrency: the client echoes back the version it
        // loaded, and the WHERE clause only matches if nobody else has saved
        // since. A missing/non-integer version fails closed (treated as a
        // conflict) rather than silently applying the overwrite.
        const clientVersion = Number.isInteger(version) ? version : -1;
        const result = await pool.query(
            `UPDATE bridges SET name = $1, type = $2, location = $3, latitude = $4, longitude = $5,
                                 description = $6, span_number = $7, length = $8, width = $9,
                                 built_year = $10, load_capacity = $11, primary_material = $12,
                                 secondary_material = $13, version = version + 1
             WHERE id = $14 AND version = $15
             RETURNING version`,
            [
                name.trim(), type || null, location || null, latitude ?? null, longitude ?? null,
                description || null, span_number || null, length || null, width ?? null,
                built_year || null, load_capacity ?? null, primary_material || null,
                secondary_material || null, req.params.id, clientVersion
            ]
        );
        if (result.rowCount === 0) {
            const exists = await pool.query('SELECT id FROM bridges WHERE id = $1', [req.params.id]);
            if (exists.rowCount === 0) return res.status(404).json({ error: 'Structure not found' });
            return res.status(409).json({
                error: 'conflict',
                message: 'This structure was edited by someone else since you opened it. Reload the page to see their changes, then reapply yours.'
            });
        }
        res.json({ success: true, version: result.rows[0].version });
    } catch (err) {
        console.error('Update bridge info error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Narrow counterpart to the above for Author's Conclusions tab - unlike
// inspection.html's Conclusions (which only lands in the DB via the big
// /update-inspection rewrite of every span/defect row), Author edits an
// already-recorded inspection it doesn't own the spans/defects arrays for,
// so this touches only the one column.
app.patch('/api/inspections/:id/conclusions', requireAuth, async (req, res) => {
    try {
        const { conclusions } = req.body;
        await pool.query('UPDATE inspections SET conclusions = $1 WHERE id = $2', [conclusions || null, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Update inspection conclusions error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Severity codes match the dropdown in inspection/inspectionA.js (1-5)
const SEVERITY_LABELS = { 1: 'Minor', 2: 'Moderate', 3: 'Severe', 4: 'Critical', 5: 'Emergency' };
const GI_CYCLE_YEARS = 2;
const PI_CYCLE_YEARS = 6;

// Same alternating-slot model as planning.html's projectSchedule(): GI and PI
// share one recurring slot rather than two independent series - every
// pi_cycle_years/gi_cycle_years-th inspection is a PI instead of a GI (e.g.
// 6yr/2yr = every 3rd), so the sequence reads GI, GI, PI, GI, GI, PI, ...
// The old "most recent GI + 2yr vs most recent PI + 6yr, take the earlier"
// approach broke down whenever a bridge's history didn't yet contain one of
// the two types (e.g. only ever inspected as PI) - with no GI entry to
// compare against, the PI date won by default even when a GI was actually
// due first. `bridge` supplies per-structure overrides (falls back to the
// 2yr/6yr default); `nextInspectionOverride`, if given, rebases the due date
// onto a manually-set date - only meaningful for "what's next as of today",
// not when reprinting a past inspection's historical context.
function computeNextDue(bridge, historyUpToNow, nextInspectionOverride) {
    if (!historyUpToNow || !historyUpToNow.length) return null;
    const giCycle = (bridge && bridge.gi_cycle_years > 0) ? bridge.gi_cycle_years : GI_CYCLE_YEARS;
    const piCycle = (bridge && bridge.pi_cycle_years > 0) ? bridge.pi_cycle_years : PI_CYCLE_YEARS;
    const piEveryNth = Math.max(1, Math.round(piCycle / giCycle));

    const lastDate = new Date(historyUpToNow[historyUpToNow.length - 1].inspection_date);
    const dueDate = nextInspectionOverride
        ? new Date(nextInspectionOverride)
        : new Date(lastDate.getFullYear() + giCycle, lastDate.getMonth(), lastDate.getDate());

    const stepIndex = historyUpToNow.length + 1;
    const type = (stepIndex % piEveryNth === 0) ? 'PI' : 'GI';
    return { type, date: dueDate };
}

// Used by the full inspection report's "4.3 Next Inspection" section
// (test.js) to replace the old flat "24 months" boilerplate with the same
// GI/PI cycle schedule planning.html and the twinView card use - computed as
// of the reported inspection's own date/position in the bridge's history,
// not "today" (so reprinting an old report keeps showing what was due after
// THAT inspection, not what's due now) - which is also why, unlike
// /api/twin's "today" usage, this never applies next_inspection_override.
app.get('/api/inspection/next-due', requireAuth, async (req, res) => {
    try {
        const { structure_id, date } = req.query;
        const bridge = await dbGet('SELECT * FROM bridges WHERE id = $1', [structure_id]);
        if (!bridge) return res.status(404).json({ error: 'Bridge not found' });

        const historyUpToNow = await dbAll(
            `SELECT id, inspection_date FROM inspections
             WHERE structure_id = $1 AND inspection_date <= $2
             ORDER BY inspection_date ASC, id ASC`,
            [structure_id, date]
        );

        const nextDue = computeNextDue(bridge, historyUpToNow, null);
        if (!nextDue) return res.json({ type: null, date: null });
        res.json({ type: nextDue.type, date: nextDue.date.toISOString() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Aggregated data for the twinView 3D digital twin (twin/twin.html + twin.js).
// 3D geometry (deck width/truss height/panels per span) is NOT here - it's
// hand-authored per bridge id in twin/bridgeModels.js, not stored in the DB.
app.get('/api/twin/:structureId', requireAuth, async (req, res) => {
    try {
        const { structureId } = req.params;
        const { inspectionId } = req.query;

        const bridge = await dbGet('SELECT * FROM bridges WHERE id = $1', [structureId]);
        if (!bridge) {
            return res.status(404).json({ error: 'Bridge not found' });
        }

        // Real per-span geometry (see scripts/backfill-bridge-spans.js) - the
        // 3D model itself stays a uniform-span stylised representation (see
        // rebuildModel()'s cantilever-bridge comment in twin.js for why it
        // deliberately isn't a literal scale model), but the total/average
        // length it's built from should come from the actual span rows
        // rather than re-deriving bridge.length / span_number here, so an
        // edited span is reflected instead of silently ignored.
        const bridgeSpanRows = await dbAll(
            'SELECT length FROM bridge_spans WHERE bridge_id = $1 ORDER BY span_number',
            [structureId]
        );

        const allInspections = await dbAll(
            `SELECT id, inspection_date, inspection_type, overall_bciave, overall_bcicrit
             FROM inspections WHERE structure_id = $1 ORDER BY inspection_date ASC`,
            [structureId]
        );
        const latestInspection = allInspections.length
            ? allInspections[allInspections.length - 1]
            : null;
        // Which inspection's spans/defects/BCI to show - defaults to latest,
        // but the timeline panel lets the user pick an earlier one to view.
        const selectedInspection = inspectionId
            ? (allInspections.find(i => String(i.id) === String(inspectionId)) || latestInspection)
            : latestInspection;

        let spans = [];
        let defects = [];
        if (selectedInspection) {
            spans = await dbAll(
                `SELECT span_number, bci_crit, bci_av FROM inspection_spans
                 WHERE inspection_id = $1 ORDER BY span_number ASC`,
                [selectedInspection.id]
            );
            const defectRows = await dbAll(
                `SELECT d.id, d.span_number, d.element_no, d.severity, d.extent, d.defect_type, d.defect_number,
                        d.works_required, d.priority, d.cost, d.comments, d.remedial_works, d.pos_x, d.pos_y, d.pos_z,
                        (SELECT COUNT(*) FROM defect_photos dp WHERE dp.defect_id = d.id) AS photo_count
                 FROM defects d WHERE d.inspection_id = $1
                 ORDER BY d.span_number, d.element_no`,
                [selectedInspection.id]
            );
            defects = defectRows.map(d => {
                const sev = parseInt(d.severity, 10);
                return {
                    id: d.id,
                    spanNumber: d.span_number,
                    elementNo: d.element_no,
                    severity: sev || null,
                    severityLabel: SEVERITY_LABELS[sev] || null,
                    extent: d.extent || null,
                    defectType: d.defect_type || null,
                    defectNumber: d.defect_number || null,
                    worksRequired: d.works_required === 'Y',
                    priority: d.priority || null,
                    cost: d.cost !== null ? parseFloat(d.cost) : null,
                    comments: (d.comments && d.comments !== 'Add') ? d.comments : null,
                    remedialWorks: d.remedial_works || null,
                    x: d.pos_x !== null ? parseFloat(d.pos_x) : null,
                    y: d.pos_y !== null ? parseFloat(d.pos_y) : null,
                    z: d.pos_z !== null ? parseFloat(d.pos_z) : null,
                    photoCount: parseInt(d.photo_count, 10) || 0
                };
            });
        }

        const spanBCI = spans.map(s => s.bci_av !== null ? parseFloat(s.bci_av) : null);
        const validSpanBCI = spanBCI.filter(v => v !== null);
        const avgSpanBCI = validSpanBCI.length
            ? validSpanBCI.reduce((a, b) => a + b, 0) / validSpanBCI.length
            : null;
        const critSpan = spans.reduce((worst, s) => {
            if (s.bci_crit === null) return worst;
            return (!worst || parseFloat(s.bci_crit) < parseFloat(worst.bci_crit)) ? s : worst;
        }, null);

        const bciAvg = selectedInspection?.overall_bciave != null
            ? parseFloat(selectedInspection.overall_bciave)
            : (avgSpanBCI != null ? avgSpanBCI : (bridge.bci_av != null ? parseFloat(bridge.bci_av) : null));
        const bciCrit = selectedInspection?.overall_bcicrit != null
            ? parseFloat(selectedInspection.overall_bcicrit)
            : (critSpan ? parseFloat(critSpan.bci_crit) : null);

        // Next-due / overdue (see computeNextDue - GI/PI share one alternating
        // slot, using this bridge's own cycle-years/override from Planning).
        const nextDue = computeNextDue(bridge, allInspections, bridge.next_inspection_override);
        const isOverdue = nextDue ? nextDue.date < new Date() : false;

        // BCI trend: selected inspection's scores vs. the one immediately
        // before it chronologically (not necessarily the latest, since the
        // timeline panel lets the user pick an older inspection to view).
        const selectedIndex = selectedInspection
            ? allInspections.findIndex(i => i.id === selectedInspection.id)
            : -1;
        const previousInspection = selectedIndex > 0 ? allInspections[selectedIndex - 1] : null;
        const prevBciAvg = previousInspection?.overall_bciave != null ? parseFloat(previousInspection.overall_bciave) : null;
        const prevBciCrit = previousInspection?.overall_bcicrit != null ? parseFloat(previousInspection.overall_bcicrit) : null;

        const dateFmt = d => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const monthYearFmt = d => d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

        const lastInspectionLabel = latestInspection
            ? `${latestInspection.inspection_type || 'Inspection'} · ${dateFmt(new Date(latestInspection.inspection_date))}`
            : null;
        const nextInspectionLabel = nextDue
            ? `${nextDue.type} · ${monthYearFmt(nextDue.date)}${isOverdue ? ' (overdue)' : ''}`
            : null;

        const years = allInspections
            .map(i => new Date(i.inspection_date).getFullYear())
            .concat(nextDue ? [nextDue.date.getFullYear()] : []);
        const timelineRange = years.length ? `${Math.min(...years)} — ${Math.max(...years)}` : null;

        const inspections = allInspections.map(i => ({
            id: i.id,
            type: i.inspection_type || 'GI',
            date: monthYearFmt(new Date(i.inspection_date)),
            timestamp: new Date(i.inspection_date).getTime(),
            bciAvg: i.overall_bciave != null ? parseFloat(i.overall_bciave) : null,
            bciCrit: i.overall_bcicrit != null ? parseFloat(i.overall_bcicrit) : null
        }));

        const spanNumber = bridge.span_number || spans.length || bridgeSpanRows.length || 1;
        const material = [bridge.primary_material, bridge.secondary_material].filter(Boolean).join(' / ') || null;

        // Sum of real per-span lengths when bridge_spans has been populated
        // for this structure; falls back to the old length/span_number
        // division only for a structure that somehow predates the backfill.
        const spanRowTotal = bridgeSpanRows.reduce((sum, s) => s.length != null ? sum + parseFloat(s.length) : sum, 0);
        const totalLength = bridgeSpanRows.length && spanRowTotal > 0 ? spanRowTotal : bridge.length;
        const avgSpanLength = totalLength ? totalLength / spanNumber : null;

        res.json({
            id: bridge.id,
            name: bridge.name,
            location: bridge.location,
            type: bridge.type,
            spans: spanNumber,
            spanLength: avgSpanLength,
            material,
            yearBuilt: bridge.built_year,
            bciAvg,
            bciCrit,
            prevBciAvg,
            prevBciCrit,
            prevInspectionType: previousInspection?.inspection_type || null,
            bciCritLocation: critSpan ? `span ${critSpan.span_number}` : null,
            spanBCI,
            defects,
            inspections,
            timelineRange,
            lastInspection: lastInspectionLabel,
            nextInspection: nextInspectionLabel,
            isOverdue,
            selectedInspectionId: selectedInspection ? selectedInspection.id : null,
            latestInspectionId: latestInspection ? latestInspection.id : null
        });
    } catch (err) {
        console.error('Twin data error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Maintenance history - user-editable log of work carried out on a
// structure, shown/edited from twinView (see maintenance_history table
// definition above for why this is separate from inspections/defects).
app.get('/api/bridges/:structureId/maintenance', requireAuth, async (req, res) => {
    try {
        const rows = await dbAll(
            'SELECT * FROM maintenance_history WHERE structure_id = $1 ORDER BY date DESC, id DESC',
            [req.params.structureId]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error fetching maintenance history:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/bridges/:structureId/maintenance', requireAuth, async (req, res) => {
    try {
        const { date, category, title, description } = req.body;
        if (!date || !title) return res.status(400).json({ error: 'date and title are required' });
        const row = await dbGet(
            `INSERT INTO maintenance_history (structure_id, date, category, title, description, created_by)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [req.params.structureId, date, category || 'other', title, description || null, req.session.username || null]
        );
        res.json(row);
    } catch (err) {
        console.error('Error adding maintenance record:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/maintenance/:id', requireAuth, async (req, res) => {
    try {
        const { date, category, title, description } = req.body;
        if (!date || !title) return res.status(400).json({ error: 'date and title are required' });
        const row = await dbGet(
            `UPDATE maintenance_history
             SET date = $1, category = $2, title = $3, description = $4, updated_at = CURRENT_TIMESTAMP
             WHERE id = $5 RETURNING *`,
            [date, category || 'other', title, description || null, req.params.id]
        );
        if (!row) return res.status(404).json({ error: 'Record not found' });
        res.json(row);
    } catch (err) {
        console.error('Error updating maintenance record:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/maintenance/:id', requireAuth, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM maintenance_history WHERE id = $1', [req.params.id]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Record not found' });
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting maintenance record:', err);
        res.status(500).json({ error: err.message });
    }
});

// Files are buffered in memory, then uploaded to Supabase Storage explicitly
// inside each route handler (the storage path depends on route params/body
// that multer's storage engine callbacks have, but doing the actual upload
// there would make error handling/rollback awkward - simpler to just hold
// the buffer and upload it once the handler has validated everything).
function buildDocStoragePath(structureId, originalname) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(originalname);
    return `bridge_${structureId}/documents/${uniqueSuffix}${ext}`;
}

const docMemoryStorage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/plain',
        'application/zip',
        'application/vnd.rar'
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
    }
};

const upload = multer({
    storage: docMemoryStorage,
    limits: {
        fileSize: 15 * 1024 * 1024,
        files: 20
    },
    fileFilter: fileFilter
});

// Get folders for a bridge
app.get('/api/bridges/:structureId/folders', requireAuth, async (req, res) => {
    try {
        const { structureId } = req.params;
        const { parentId } = req.query;

        let query = 'SELECT * FROM folders WHERE bridge_id = $1';
        const params = [structureId];

        if (parentId) {
            query += ' AND parent_id = $2';
            params.push(parentId);
        } else {
            query += ' AND parent_id IS NULL';
        }

        const folders = await dbAll(query, params);
        res.json(folders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create folder in a bridge
app.post('/api/bridges/:structureId/folders', requireAuth, async (req, res) => {
    try {
        const { structureId } = req.params;
        const { name, parent_id } = req.body;

        const bridgeExists = await dbGet('SELECT 1 FROM bridges WHERE id = $1', [structureId]);
        if (!bridgeExists) {
            return res.status(404).json({ error: 'Bridge not found' });
        }

        if (parent_id) {
            const parentExists = await dbGet(
                'SELECT 1 FROM folders WHERE id = $1 AND bridge_id = $2', 
                [parent_id, structureId]
            );
            if (!parentExists) {
                return res.status(400).json({ error: 'Parent folder not found in this bridge' });
            }
        }

        const result = await pool.query(
            'INSERT INTO folders (name, parent_id, bridge_id) VALUES ($1, $2, $3) RETURNING id',
            [name, parent_id || null, structureId]
        );

        res.status(201).json({
            id: result.rows[0].id,
            name,
            parent_id: parent_id || null,
            bridge_id: structureId
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get files for a bridge
app.get('/api/bridges/:structureId/files', requireAuth, async (req, res) => {
    try {
        const { structureId } = req.params;
        const { folderId } = req.query;

        let query = 'SELECT * FROM files WHERE bridge_id = $1';
        const params = [structureId];

        if (folderId) {
            query += ' AND folder_id = $2';
            params.push(folderId);
        } else {
            query += ' AND folder_id IS NULL';
        }

        const files = await dbAll(query, params);
        const signedFiles = await Promise.all(files.map(async f => ({
            ...f,
            filepath: await storage.getSignedUrl(f.filepath)
        })));
        res.json(signedFiles);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Upload file to a bridge
app.post('/api/bridges/:structureId/files', requireAuth,
    (req, res, next) => {
        upload.single('file')(req, res, (err) => {
            if (!err) return next();
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'File exceeds the 15MB limit.' });
            }
            return res.status(400).json({ error: err.message });
        });
    },
    async (req, res) => {
    try {
        const { structureId } = req.params;
        const { folderId } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const bridgeExists = await dbGet('SELECT 1 FROM bridges WHERE id = $1', [structureId]);
        if (!bridgeExists) {
            return res.status(404).json({ error: 'Bridge not found' });
        }

        if (folderId) {
            const folderExists = await dbGet(
                'SELECT 1 FROM folders WHERE id = $1 AND bridge_id = $2',
                [folderId, structureId]
            );
            if (!folderExists) {
                return res.status(400).json({ error: 'Folder not found in this bridge' });
            }
        }

        const filePath = buildDocStoragePath(structureId, req.file.originalname);
        await storage.uploadFile(filePath, req.file.buffer, req.file.mimetype);

        const result = await pool.query(
            `INSERT INTO files (name, filepath, size, mime_type, folder_id, bridge_id)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [
                req.file.originalname,
                filePath,
                req.file.size,
                req.file.mimetype,
                folderId || null,
                structureId
            ]
        );

        res.status(201).json({
            id: result.rows[0].id,
            name: req.file.originalname,
            filepath: filePath,
            size: req.file.size,
            mime_type: req.file.mimetype,
            bridge_id: structureId,
            folder_id: folderId || null,
            created_at: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete file endpoint - corrected version
app.delete('/api/bridges/:structureId/files/:fileId', requireAuth, async (req, res) => {
    try {
        const { structureId, fileId } = req.params;

        if (!structureId || !fileId) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const file = await dbGet(
            'SELECT filepath FROM files WHERE id = $1 AND bridge_id = $2',
            [fileId, structureId]
        );

        if (!file || !file.filepath) {
            return res.status(404).json({ error: 'File not found' });
        }

        const result = await pool.query(
            'DELETE FROM files WHERE id = $1 AND bridge_id = $2',
            [fileId, structureId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'File not found in database' });
        }

        await storage.deleteFile(file.filepath);

        res.json({ success: true });

    } catch (err) {
        console.error('File deletion error:', err);
        res.status(500).json({ 
            error: 'Server error during file deletion',
            details: err.message 
        });
    }
});

// Delete folder endpoint - improved version
app.delete('/api/bridges/:structureId/folders/:folderId', requireAuth, async (req, res) => {
    try {
        const { structureId, folderId } = req.params;

        if (!structureId || !folderId) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const folder = await dbGet(
            'SELECT id FROM folders WHERE id = $1 AND bridge_id = $2', 
            [folderId, structureId]
        );

        if (!folder) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        const result = await pool.query(
            'DELETE FROM folders WHERE id = $1 AND bridge_id = $2',
            [folderId, structureId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'No folder deleted' });
        }

        res.json({ 
            success: true,
            message: 'Folder and its contents deleted successfully'
        });

    } catch (err) {
        console.error('Folder deletion error:', err);
        res.status(500).json({ 
            error: 'Server error during folder deletion',
            details: err.message 
        });
    }
});


// Backend route for getting folder path
app.get('/api/bridges/:structureId/folders/:folderId/path', requireAuth, async (req, res) => {
    try {
        const { structureId, folderId } = req.params;

        // PostgreSQL recursive CTE - depth tracks distance from the target
        // folder (0 = itself, 1 = parent, ...) so the result can be ordered
        // by actual hierarchy position. created_at isn't reliable for this:
        // it doesn't reflect nesting depth, and is null on existing rows.
        const path = await dbAll(`
            WITH RECURSIVE folder_path AS (
                SELECT id, name, parent_id, bridge_id, 0 AS depth
                FROM folders
                WHERE id = $1 AND bridge_id = $2

                UNION ALL

                SELECT f.id, f.name, f.parent_id, f.bridge_id, fp.depth + 1
                FROM folders f
                INNER JOIN folder_path fp ON f.id = fp.parent_id
                WHERE f.bridge_id = $2 AND fp.parent_id IS NOT NULL
            )
            SELECT id, name, parent_id FROM folder_path
            ORDER BY depth ASC
        `, [folderId, structureId]);

        res.json(path);
    } catch (err) {
        console.error('Error fetching folder path:', err);
        res.status(500).json({ error: 'Failed to fetch folder path' });
    }
});

// In your routes/debug.js or wherever this route lives
app.get('/api/debug/count-test', requireAuth, async (req, res) => {
    try {
        const result = await dbGet("SELECT COUNT(*) as count FROM bridges");
        res.json({ 
            success: true,
            bridge_count: result.count,
            server: "debug-server"
        });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ 
            success: false,
            error: err.message 
        });
    }
});

// SAVE INSPECTION DATA TO DATABASE
app.post('/save-inspection', requireAuth, async (req, res) => {
    const { inspection, defects, photoData = {}, notes = [] } = req.body;
    if (inspection) {
        inspection.structure_name = stripAngleBrackets(inspection.structure_name, 200);
        inspection.inspector_name = stripAngleBrackets(inspection.inspector_name, 200);
        if (typeof inspection.conclusions === 'string') inspection.conclusions = inspection.conclusions.slice(0, 10000);
    }

    // Idempotent retry short-circuit - see the client_submission_id column
    // migration above for why this exists. Checked before opening a
    // transaction so a repeat retry doesn't pay for the full insert work.
    if (inspection.client_submission_id) {
        const already = await pool.query(
            'SELECT id FROM inspections WHERE client_submission_id = $1',
            [inspection.client_submission_id]
        );
        if (already.rows.length > 0) {
            return res.json({ success: true, inspectionId: already.rows[0].id, message: 'Inspection already saved' });
        }
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Compute overall BCI averages from spans. Default to 100 only when a
        // span's score is genuinely missing (NaN) - `parseFloat(x) || 100`
        // looks equivalent but silently replaces a real score of 0 (worst
        // possible BCI) with 100 (perfect), since 0 is falsy in JS.
        const bciCrits = inspection.spans.map(s => { const v = parseFloat(s.bciCrit); return Number.isNaN(v) ? 100 : v; });
        const bciAvs   = inspection.spans.map(s => { const v = parseFloat(s.bciAv);   return Number.isNaN(v) ? 100 : v; });
        const overallBciCrit = parseFloat((bciCrits.reduce((a, b) => a + b, 0) / bciCrits.length).toFixed(2));
        const overallBciAve  = parseFloat((bciAvs.reduce((a, b) => a + b, 0) / bciAvs.length).toFixed(2));

        // 1. Insert inspection with overall BCI
        const source = inspection.source === 'field' ? 'field' : 'desktop';
        const inspectionResult = await client.query(
            `INSERT INTO inspections (
                structure_id, structure_name, inspection_date,
                inspection_type, inspector_name, total_spans, conclusions,
                overall_bcicrit, overall_bciave, source, client_submission_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
            [
                inspection.structure_id,
                inspection.structure_name,
                inspection.inspection_date,
                inspection.inspection_type,
                inspection.inspector_name,
                inspection.total_spans,
                inspection.conclusions || '',
                overallBciCrit,
                overallBciAve,
                source,
                inspection.client_submission_id || null
            ]
        );

        const inspectionId = inspectionResult.rows[0].id;
        const insertedDefects = [];

        // 2. Insert spans
        for (const span of inspection.spans) {
            await client.query(
                `INSERT INTO inspection_spans (
                    inspection_id, span_number, elements_inspected,
                    photographs_taken, comments, bci_crit, bci_av
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    inspectionId,
                    span.spanNumber,
                    span.elementsInspected ? 1 : 0,
                    span.photographsTaken ? 1 : 0,
                    span.comments || '',
                    span.bciCrit || null,
                    span.bciAv || null
                ]
            );
        }

        // 3. Insert defects
        if (defects.length > 0) {
            const defectCounts = {};

            for (const defect of defects) {
                const key = `${defect.spanNumber}-${defect.elementNumber}`;
                defectCounts[key] = (defectCounts[key] || 0) + 1;

                const defectCombined = `${defect.defectType}.${defect.defectNumber}`;
                const tempDefectKey = `${inspection.structure_id}_${inspection.inspection_date}_${defect.spanNumber}_${defect.elementNumber}_${defectCombined}`;


                const defectResult = await client.query(
                    `INSERT INTO defects (
                        inspection_id, span_number, element_no,
                        defect_no, defect_type, defect_number,
                        severity, extent, works_required,
                        priority, cost, comments, remedial_works, timestamp,
                        pos_x, pos_y, pos_z, is_primary
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
                    [
                        inspectionId,
                        defect.spanNumber,
                        defect.elementNumber,
                        defectCounts[key],
                        defect.defectType,
                        defect.defectNumber,
                        defect.severity,
                        defect.extent,
                        defect.worksRequired,
                        // Priority/cost only mean anything when works are
                        // actually required - defaulting them regardless of
                        // worksRequired is what was making the BCI Proforma
                        // show a stray priority/cost on defects with no
                        // works required (or 'M'/possibly).
                        defect.worksRequired === 'Y' ? (defect.priority?.charAt(0) || 'M') : null,
                        defect.worksRequired === 'Y' ? (parseFloat(defect.cost) || 0) : null,
                        defect.comments || '',
                        defect.remedial_works || '',
                        defect.timestamp || new Date().toISOString(),
                        defect.posX ?? null,
                        defect.posY ?? null,
                        defect.posZ ?? null,
                        defect.isPrimary === true
                    ]
                );

                const defectId = defectResult.rows[0].id;
                insertedDefects.push({
                    defectId: defectId,
                    tempDefectKey: tempDefectKey,
                    spanNumber: defect.spanNumber,
                    elementNumber: defect.elementNumber,
                    defectNo: defectCounts[key]
                });
            }
        }

        // 4. Insert photos
        if (Object.keys(photoData).length > 0) {
            let totalPhotos = 0;

            for (const defect of insertedDefects) {
                if (photoData[defect.tempDefectKey]) {
                    totalPhotos += photoData[defect.tempDefectKey].length;

                    for (let i = 0; i < photoData[defect.tempDefectKey].length; i++) {
                        const photo = photoData[defect.tempDefectKey][i];
                        await client.query(
                            `INSERT INTO defect_photos (
                                defect_id, photo_url, photo_description, display_order, front_defectid
                            ) VALUES ($1, $2, $3, $4, $5)`,
                            [
                                defect.defectId,
                                photo.photo_url,
                                photo.photo_description,
                                photo.display_order || i,
                                defect.tempDefectKey
                            ]
                        );
                    }
                }
            }

            // General site photos - not tied to any defect, attached to the
            // inspection itself instead ('general' is the reserved key both
            // apps use for these, same convention as a real defect's temp key).
            if (photoData['general']) {
                for (let i = 0; i < photoData['general'].length; i++) {
                    const photo = photoData['general'][i];
                    await client.query(
                        `INSERT INTO defect_photos (
                            inspection_id, photo_url, photo_description, display_order
                        ) VALUES ($1, $2, $3, $4)`,
                        [inspectionId, photo.photo_url, photo.photo_description, photo.display_order || i]
                    );
                }
            }
        }

        // 5. Insert notes - e.g. Field's Notes tab, submitted as one
        // 'field'-sourced entry alongside the rest of a brand-new inspection
        // rather than requiring the inspection to exist first. Author is
        // always the logged-in session, never trusted from the client.
        for (const note of notes) {
            if (!note || !note.text || !note.text.trim()) continue;
            await client.query(
                `INSERT INTO inspection_notes (inspection_id, text, source, author)
                 VALUES ($1, $2, $3, $4)`,
                [inspectionId, note.text.trim(), note.source === 'field' ? 'field' : 'core', req.session.username || null]
            );
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            inspectionId,
            defectCount: insertedDefects.length,
            message: 'Inspection saved successfully'
        });

    } catch (err) {
        await client.query('ROLLBACK');
        // 23505 = unique_violation. Only realistically hit here on
        // client_submission_id (the only unique constraint this insert can
        // trip) if two retries of the same job raced past the pre-check
        // above - treat it the same as a normal idempotent retry rather
        // than surfacing a false failure.
        if (err.code === '23505' && inspection.client_submission_id) {
            const already = await pool.query(
                'SELECT id FROM inspections WHERE client_submission_id = $1',
                [inspection.client_submission_id]
            );
            if (already.rows.length > 0) {
                return res.json({ success: true, inspectionId: already.rows[0].id, message: 'Inspection already saved' });
            }
        }
        console.error('[ERROR] Transaction failed:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    } finally {
        client.release();
    }
});

// UPDATE INSPECTION ENDPOINT
app.put('/update-inspection', requireAuth, async (req, res) => {
    // Notes aren't part of this payload - by the time a desktop user is
    // editing an existing inspection, its id is already known (loaded via
    // /api/inspection/full), so the notes panel posts new entries live via
    // POST /api/inspections/:id/notes instead of batching them here. Only a
    // brand-new inspection (still going through /save-inspection, no id
    // yet) needs notes queued into the save payload itself.
    const { inspection, defects, inspectionId, version } = req.body;
    if (inspection) {
        inspection.structure_name = stripAngleBrackets(inspection.structure_name, 200);
        inspection.inspector_name = stripAngleBrackets(inspection.inspector_name, 200);
        if (typeof inspection.conclusions === 'string') inspection.conclusions = inspection.conclusions.slice(0, 10000);
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Verify inspection exists
        const existingInspection = await client.query(
            'SELECT id FROM inspections WHERE id = $1',
            [inspectionId]
        );

        if (existingInspection.rows.length === 0) {
            throw new Error("Inspection not found");
        }

        // Compute overall BCI averages from spans. Default to 100 only when a
        // span's score is genuinely missing (NaN) - see the matching comment
        // in /save-inspection for why `parseFloat(x) || 100` is wrong here.
        const bciCrits = inspection.spans.map(s => { const v = parseFloat(s.bciCrit); return Number.isNaN(v) ? 100 : v; });
        const bciAvs   = inspection.spans.map(s => { const v = parseFloat(s.bciAv);   return Number.isNaN(v) ? 100 : v; });
        const overallBciCrit = parseFloat((bciCrits.reduce((a, b) => a + b, 0) / bciCrits.length).toFixed(2));
        const overallBciAve  = parseFloat((bciAvs.reduce((a, b) => a + b, 0) / bciAvs.length).toFixed(2));

        // 2. Update inspection with overall BCI. Editing an inspection that
        // was already approved/rejected sends it back for re-review — the
        // CASE expressions read the pre-update row, so this correctly
        // resets status and clears the now-stale decision in one statement,
        // and is a no-op for an inspection still 'submitted'.
        //
        // Optimistic concurrency: below this point every span/defect row for
        // the inspection gets deleted and reinserted from the client's
        // in-memory copy (see step 3), so two people editing the same
        // inspection at once would otherwise mean whoever saves second wipes
        // out whatever the first person just added, with no warning. The
        // `AND version = $11` only lets this through if nobody else has
        // saved since this client loaded the inspection; a missing/
        // non-integer version fails closed (treated as a conflict) rather
        // than silently applying the overwrite.
        const clientVersion = Number.isInteger(version) ? version : -1;
        const updateResult = await client.query(
            `UPDATE inspections SET
                structure_id = $1,
                structure_name = $2,
                inspection_date = $3,
                inspection_type = $4,
                inspector_name = $5,
                total_spans = $6,
                conclusions = $7,
                overall_bcicrit = $8,
                overall_bciave = $9,
                status = CASE WHEN status IN ('approved','rejected') THEN 'submitted' ELSE status END,
                reviewed_by = CASE WHEN status IN ('approved','rejected') THEN NULL ELSE reviewed_by END,
                reviewed_at = CASE WHEN status IN ('approved','rejected') THEN NULL ELSE reviewed_at END,
                engineer_comments = CASE WHEN status IN ('approved','rejected') THEN NULL ELSE engineer_comments END,
                updated_at = CURRENT_TIMESTAMP,
                version = version + 1
            WHERE id = $10 AND version = $11
            RETURNING version`,
            [
                inspection.structure_id,
                inspection.structure_name,
                inspection.inspection_date,
                inspection.inspection_type,
                inspection.inspector_name,
                inspection.total_spans,
                inspection.conclusions || '',
                overallBciCrit,
                overallBciAve,
                inspectionId,
                clientVersion
            ]
        );

        if (updateResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                error: 'conflict',
                message: 'This inspection was edited by someone else since you opened it. Reload the page to see their changes, then reapply yours.'
            });
        }
        const newVersion = updateResult.rows[0].version;

        // 3. Delete existing spans and defects
        //
        // Every defect gets a brand-new id below regardless of whether it
        // changed, so defect_photos.defect_id (which has no FK, and is set
        // once at upload time to whatever the defect's id was *then*) would
        // otherwise silently point at a row that no longer exists after
        // every single save - the photo is still stored, but orphaned and
        // invisible. Capture each defect's business identity (span/element/
        // type/number) -> its current id here, before it's deleted, so the
        // insert loop below can reattach photos to the new id instead.
        const oldDefectsResult = await client.query(
            `SELECT id, span_number, element_no, defect_type, defect_number
             FROM defects WHERE inspection_id = $1`,
            [inspectionId]
        );
        const oldDefectIdByIdentity = {};
        oldDefectsResult.rows.forEach(row => {
            const identity = `${row.span_number}-${row.element_no}-${row.defect_type}-${row.defect_number}`;
            oldDefectIdByIdentity[identity] = row.id;
        });

        await client.query('DELETE FROM defects WHERE inspection_id = $1', [inspectionId]);
        await client.query('DELETE FROM inspection_spans WHERE inspection_id = $1', [inspectionId]);

        // 4. Insert new spans
        const validSpans = new Set();
        for (const span of inspection.spans) {
            validSpans.add(span.spanNumber);
            await client.query(
                `INSERT INTO inspection_spans (
                    inspection_id, span_number, elements_inspected,
                    photographs_taken, comments, bci_crit, bci_av
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    inspectionId,
                    span.spanNumber,
                    span.elementsInspected ? 1 : 0,
                    span.photographsTaken ? 1 : 0,
                    span.comments || '',
                    span.bciCrit || null,
                    span.bciAv || null
                ]
            );
        }

        // 5. Validate and insert defects
        const invalidDefects = defects.filter(d => !validSpans.has(d.spanNumber));
        if (invalidDefects.length > 0) {
            throw new Error(
                `Some defects reference invalid spans: ${invalidDefects.map(d => 
                    `Span ${d.spanNumber}, Element ${d.elementNumber}`
                ).join('; ')}`
            );
        }

        const defectCounts = {};
        for (const defect of defects) {
            const key = `${defect.spanNumber}-${defect.elementNumber}`;
            defectCounts[key] = (defectCounts[key] || 0) + 1;
            const defectNumber = defect.defectNumber || '1';

            const insertedDefect = await client.query(
                `INSERT INTO defects (
                    inspection_id, span_number, element_no, defect_no,
                    defect_type, defect_number, severity,
                    extent, works_required, priority,
                    cost, comments, remedial_works, timestamp,
                    pos_x, pos_y, pos_z, is_primary
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
                [
                    inspectionId,
                    defect.spanNumber,
                    defect.elementNumber,
                    defectCounts[key],
                    defect.defectType,
                    defectNumber,
                    defect.severity,
                    defect.extent,
                    defect.worksRequired || '',
                    // Same 'Y'-only gate as /save-inspection above.
                    defect.worksRequired === 'Y' ? (defect.priority || 'M') : null,
                    defect.worksRequired === 'Y' ? (defect.cost || 0) : null,
                    defect.comments || '',
                    defect.remedial_works || '',
                    defect.timestamp || new Date().toISOString(),
                    defect.posX ?? null,
                    defect.posY ?? null,
                    defect.posZ ?? null,
                    defect.isPrimary === true
                ]
            );

            // Same identity this defect had before (if any) - reattach its
            // existing photos to the new id, and mark it claimed so the
            // cleanup below doesn't delete them as belonging to a removed
            // defect.
            const identity = `${defect.spanNumber}-${defect.elementNumber}-${defect.defectType}-${defectNumber}`;
            const oldDefectId = oldDefectIdByIdentity[identity];
            if (oldDefectId != null) {
                await client.query(
                    'UPDATE defect_photos SET defect_id = $1 WHERE defect_id = $2',
                    [insertedDefect.rows[0].id, oldDefectId]
                );
                delete oldDefectIdByIdentity[identity];
            }
        }

        // Any old defect identity not claimed above was actually removed
        // during this edit (not just re-saved) - its photos would otherwise
        // sit orphaned forever pointing at an id that no longer exists.
        const removedDefectIds = Object.values(oldDefectIdByIdentity);
        if (removedDefectIds.length > 0) {
            await client.query(
                'DELETE FROM defect_photos WHERE defect_id = ANY($1::int[])',
                [removedDefectIds]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, inspectionId, version: newVersion });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Update error:", error);
        res.status(500).json({ 
            success: false, 
            message: error.message
        });
    } finally {
        client.release();
    }
});

// New endpoint to find inspectionId by structure_id and inspection_date
app.post('/find-inspection-id', requireAuth, async (req, res) => {
    try {
        const { structure_id, inspection_date } = req.body;
        // ORDER BY + LIMIT: without a UNIQUE(structure_id, inspection_date)
        // constraint, a race (e.g. a double-click on Save) can leave two
        // inspection rows for the same date - without this, which one comes
        // back is undefined/inconsistent, so a later edit could silently
        // load and overwrite the wrong row. Picking the most recent one
        // deterministically matches what an editor would expect.
        const row = await dbGet(
            `SELECT id FROM inspections
             WHERE structure_id = $1 AND inspection_date = $2
             ORDER BY id DESC LIMIT 1`,
            [structure_id, inspection_date]
        );

        if (!row) {
            return res.status(404).json({ success: false, message: "Inspection not found" });
        }
        res.json({ success: true, inspectionId: row.id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// EDIT BUTTON INSPECTION RETRIEVAL
// Endpoint to fetch full inspection data WITH defects and their photos
app.get('/api/inspection/full', requireAuth, async (req, res) => {
    try {
        const { structure_id, date } = req.query;

        // 1. Get inspection metadata
        const inspection = await dbGet(`
            SELECT id, structure_id, structure_name, inspection_date,
                   inspection_type, inspector_name, total_spans, conclusions,
                   overall_bcicrit, overall_bciave, source,
                   status, reviewed_by, reviewed_at, engineer_comments, version
            FROM inspections
            WHERE structure_id = $1 AND inspection_date = $2
        `, [structure_id, date]);

        if (!inspection) {
            return res.status(404).json({ error: 'Inspection not found' });
        }

        // 2. Get spans data
        const spans = await dbAll(`
            SELECT span_number, elements_inspected, 
                   photographs_taken, comments, bci_crit, bci_av
            FROM inspection_spans
            WHERE inspection_id = $1
            ORDER BY span_number
        `, [inspection.id]);

        // 3. Get defects data
        const defects = await dbAll(`
            SELECT 
                id,
                span_number,
                element_no,
                element_description,
                defect_no,
                defect_type,
                defect_number,
                severity,
                extent,
                works_required,
                remedial_works,
                priority,
                cost,
                comments,
                timestamp,
                pos_x,
                pos_y,
                pos_z,
                is_primary
            FROM defects
            WHERE inspection_id = $1
            ORDER BY span_number, element_no, defect_no
        `, [inspection.id]);

        // 4. Get photos for all defects
        const defectPhotos = await dbAll(`
            SELECT
                id,
                defect_id,
                photo_url,
                photo_description,
                display_order,
                front_defectid
            FROM defect_photos
            WHERE defect_id IN (SELECT id FROM defects WHERE inspection_id = $1)
            ORDER BY defect_id, display_order
        `, [inspection.id]);

        // Group photos by defect_id (signing each path into a temporary URL,
        // since the storage bucket is private)
        const signedDefectPhotos = await Promise.all(defectPhotos.map(async photo => ({
            ...photo,
            signedUrl: await storage.getSignedUrl(photo.photo_url)
        })));
        const photosByDefect = signedDefectPhotos.reduce((acc, photo) => {
            if (!acc[photo.defect_id]) {
                acc[photo.defect_id] = [];
            }
            acc[photo.defect_id].push({
                id: photo.id,
                url: photo.signedUrl,
                description: photo.photo_description,
                displayOrder: photo.display_order,
                frontDefectId: photo.front_defectid
            });
            return acc;
        }, {});

        // General site photos - not tied to any defect, attached to the
        // inspection itself (defect_id NULL, inspection_id set instead).
        const generalPhotosRaw = await dbAll(`
            SELECT id, photo_url, photo_description, display_order
            FROM defect_photos
            WHERE inspection_id = $1 AND defect_id IS NULL
            ORDER BY display_order
        `, [inspection.id]);
        const generalPhotos = await Promise.all(generalPhotosRaw.map(async photo => ({
            id: photo.id,
            url: await storage.getSignedUrl(photo.photo_url),
            description: photo.photo_description,
            displayOrder: photo.display_order
        })));

        // Notes log - see inspection_notes above.
        const notes = await dbAll(
            `SELECT id, text, source, author, created_at
             FROM inspection_notes WHERE inspection_id = $1 ORDER BY created_at DESC`,
            [inspection.id]
        );

        // 5. Format response
        const response = {
            id: inspection.id,
            structureId: inspection.structure_id,
            structureName: inspection.structure_name,
            inspectionDate: inspection.inspection_date,
            inspectionType: inspection.inspection_type,
            inspectorName: inspection.inspector_name,
            totalSpans: inspection.total_spans,
            conclusions: inspection.conclusions,
            overallBcicrit: inspection.overall_bcicrit,
            overallBciave: inspection.overall_bciave,
            source: inspection.source,
            status: inspection.status,
            reviewedBy: inspection.reviewed_by,
            reviewedAt: inspection.reviewed_at,
            engineerComments: inspection.engineer_comments,
            version: inspection.version,

            spans: spans.map(span => ({
                spanNumber: span.span_number,
                elementsInspected: Boolean(span.elements_inspected),
                photographsTaken: Boolean(span.photographs_taken),
                comments: span.comments || '',
                bciCrit: span.bci_crit,
                bciAv: span.bci_av
            })),

            defects: defects.map(defect => ({
                defectDbId: defect.id,
                spanNumber: defect.span_number,
                elementNumber: defect.element_no,
                elementDescription: defect.element_description,
                defectId: `${defect.defect_type}.${defect.defect_number}`,
                severity: defect.severity,
                extent: defect.extent,
                worksRequired: defect.works_required,
                remedialWorks: defect.remedial_works || '',
                priority: defect.priority,
                cost: defect.cost,
                comments: defect.comments,
                timestamp: defect.timestamp,
                x: defect.pos_x !== null ? parseFloat(defect.pos_x) : null,
                y: defect.pos_y !== null ? parseFloat(defect.pos_y) : null,
                z: defect.pos_z !== null ? parseFloat(defect.pos_z) : null,
                isPrimary: defect.is_primary === true,
                photos: photosByDefect[defect.id] || []
            })),

            generalPhotos,
            notes
        };

        res.json(response);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/author/diff — Author's core differentiator: for every element on
// the structure's checklist (not just ones with a defect row), compares this
// inspection's status against the structure's own previous inspection, so
// the inspector only has to actively review what actually changed instead of
// re-describing everything from scratch. "No Defects"/"Not Inspected" are
// real rows in `defects` using the reserved 0.0/0.1 codes (see
// inspection.js's quickRecordElement) - an element with no row at all for
// this inspection is treated as not applicable to this structure.
app.get('/api/author/diff', requireAuth, async (req, res) => {
    try {
        const { structureId, date } = req.query;
        if (!structureId || !date) {
            return res.status(400).json({ error: 'structureId and date are required' });
        }

        const bridge = await dbGet('SELECT type, organization_id FROM bridges WHERE id = $1', [structureId]);
        if (!bridge) return res.status(404).json({ error: 'Structure not found' });
        const structureType = resolveElementsType(bridge.type);

        const elements = await dbAll(
            'SELECT element_number, description FROM elements WHERE structure_type = $1 ORDER BY display_order ASC',
            [structureType]
        );

        const currentInspection = await dbGet(
            'SELECT id, inspection_date FROM inspections WHERE structure_id = $1 AND inspection_date = $2',
            [structureId, date]
        );
        if (!currentInspection) return res.status(404).json({ error: 'Inspection not found for that date' });

        const previousInspection = await dbGet(
            `SELECT id, inspection_date FROM inspections
             WHERE structure_id = $1 AND inspection_date < $2
             ORDER BY inspection_date DESC LIMIT 1`,
            [structureId, date]
        );

        const inspectionIds = [currentInspection.id, previousInspection ? previousInspection.id : null].filter(Boolean);
        const placeholders = inspectionIds.map((_, i) => `$${i + 1}`).join(',');
        const allDefects = await dbAll(
            `SELECT id, inspection_id, element_no, defect_type, defect_number, severity, extent,
                    works_required, priority, cost, comments, remedial_works
             FROM defects WHERE inspection_id IN (${placeholders})
             ORDER BY element_no, defect_no`,
            inspectionIds
        );

        // An element can have more than one defect row per inspection - the
        // primary one (or the first, if none is flagged) drives the
        // comparison, matching how BCI scoring already picks one per element.
        function elementRowsFor(inspectionId, elementNo) {
            return allDefects.filter(d => d.inspection_id === inspectionId && d.element_no === elementNo);
        }
        function summarize(rows) {
            if (!rows.length) return { status: 'na' };
            const real = rows.find(r => !(r.defect_type === '0' && (r.defect_number === '0' || r.defect_number === '1')));
            if (!real) {
                const marker = rows[0];
                return { status: marker.defect_number === '0' ? 'good' : 'ninsp' };
            }
            return {
                status: 'defect', defectDbId: real.id,
                defectType: real.defect_type, defectNumber: real.defect_number,
                severity: real.severity, extent: real.extent,
                worksRequired: real.works_required, priority: real.priority, cost: real.cost,
                comments: real.comments, remedialWorks: real.remedial_works || ''
            };
        }
        function compare(current, previous) {
            if (!previousInspection) return 'first';
            if (current.status === 'defect' && previous.status !== 'defect') return 'new';
            if (current.status !== 'defect' && previous.status === 'defect') return 'resolved';
            if (current.status === 'defect' && previous.status === 'defect') {
                const cs = parseInt(current.severity, 10) || 0, ps = parseInt(previous.severity, 10) || 0;
                if (cs > ps) return 'worsened';
                if (cs < ps) return 'improved';
                if (current.extent !== previous.extent) return 'changed';
                return 'unchanged';
            }
            return current.status === previous.status ? 'unchanged' : 'changed';
        }

        const result = elements.map(el => {
            const current = summarize(elementRowsFor(currentInspection.id, el.element_number));
            const previous = previousInspection ? summarize(elementRowsFor(previousInspection.id, el.element_number)) : null;
            return {
                elementNumber: el.element_number,
                name: el.description,
                current,
                previous,
                comparison: compare(current, previous || { status: null })
            };
        });

        res.json({
            structureType,
            currentDate: currentInspection.inspection_date,
            previousDate: previousInspection ? previousInspection.inspection_date : null,
            organizationId: bridge.organization_id,
            elements: result
        });
    } catch (err) {
        console.error('Error building author diff:', err);
        res.status(500).json({ error: err.message });
    }
});

// Drafts the inspection.html Conclusions textarea's "Suggest Draft" button
// with Gemini instead of the client's local template - see
// generateDraftConclusions() in inspection/spans.js, which is what the
// client falls back to if this errors (missing/invalid key, quota,
// network - same fallback shape as Author's extraction flow below). When
// the request also carries currentText/instruction (the "ask AI to adjust"
// follow-up), this revises that text instead of drafting a fresh one.
app.post('/api/draft-conclusions', requireAuth, async (req, res) => {
    try {
        const { currentText, instruction, ...summary } = req.body || {};
        const text = (currentText && instruction)
            ? await reviseConclusionsWithGemini(currentText, instruction, summary)
            : await draftConclusionsWithGemini(summary);
        res.json({ success: true, text });
    } catch (err) {
        console.error('Draft conclusions error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Author's "Upload a previous inspection" flow - for a structure whose
// last inspection wasn't done in spanSense. Extracts per-element narrative
// out of an uploaded PDF/Word report (see extractPreviousInspection.js for
// the approach/limitations) and returns the same shape /api/author/diff
// does, with previous always null and comparison always 'first' - the
// extracted content becomes the starting draft itself, not a second data
// source diffed against some other spanSense inspection.
app.post('/api/author/extract-previous-inspection', requireAuth, upload.single('file'), async (req, res) => {
    try {
        const { structureId } = req.body;
        if (!structureId) return res.status(400).json({ error: 'structureId is required' });
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const bridge = await dbGet('SELECT type, organization_id FROM bridges WHERE id = $1', [structureId]);
        if (!bridge) return res.status(404).json({ error: 'Structure not found' });
        const structureType = resolveElementsType(bridge.type);

        const elementRows = await dbAll(
            'SELECT element_number, description FROM elements WHERE structure_type = $1 ORDER BY display_order ASC',
            [structureType]
        );

        let text;
        if (req.file.mimetype === 'application/pdf') {
            const parser = new PDFParse({ data: req.file.buffer });
            const result = await parser.getText();
            text = result.text;
        } else if (
            req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            req.file.mimetype === 'application/msword'
        ) {
            const result = await mammoth.extractRawText({ buffer: req.file.buffer });
            text = result.value;
        } else {
            return res.status(400).json({ error: 'Please upload a PDF or Word (.doc/.docx) file.' });
        }

        const mappedRows = elementRows.map(r => ({
            element_number: r.element_number,
            description: r.description
        }));

        // Gemini matches elements by meaning, not by exact "X.Y.Z" heading
        // format/order the regex fallback depends on - falls back to it
        // (missing/invalid key, free-tier quota, network, malformed
        // response) so the upload flow still works either way.
        let elements, warning;
        try {
            ({ elements, warning } = await extractElementsWithGemini(text, mappedRows));
        } catch (err) {
            console.warn('Gemini extraction failed, falling back to regex extraction:', err.message);
            ({ elements, warning } = extractElements(text, mappedRows));
        }

        res.json({
            structureType,
            organizationId: bridge.organization_id,
            elements,
            warning
        });
    } catch (err) {
        console.error('Error extracting previous inspection:', err);
        res.status(500).json({ error: err.message });
    }
});

// structure/add-structure.html's "Extract from document" option - pulls
// structure identification facts (name, location, dimensions, materials,
// built year) out of an uploaded BCI Pro forma or inspection report cover
// sheet, to prefill the Add Structure form for review rather than typing
// it all in by hand. Same Gemini-based approach as the previous-inspection
// extractor above, but for a structure that doesn't exist in spanSense yet
// - there's no structureId/element list to match against here. No regex
// fallback: unlike the "X.Y.Z" element-heading convention that fallback
// depends on, a structure's identifying facts don't follow any fixed
// format to pattern-match against, so if Gemini can't be reached the user
// just fills the form in manually.
app.post('/api/bridges/extract-info', requireAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        let text;
        if (req.file.mimetype === 'application/pdf') {
            const parser = new PDFParse({ data: req.file.buffer });
            const result = await parser.getText();
            text = result.text;
        } else if (
            req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            req.file.mimetype === 'application/msword'
        ) {
            const result = await mammoth.extractRawText({ buffer: req.file.buffer });
            text = result.value;
        } else {
            return res.status(400).json({ error: 'Please upload a PDF or Word (.doc/.docx) file.' });
        }

        const info = await extractStructureInfoWithGemini(text);
        res.json({ success: true, info });
    } catch (err) {
        console.error('Error extracting structure info:', err.message);
        res.status(500).json({ error: err.message || 'Extraction failed - please fill the form in manually.' });
    }
});

// Author branding - set once per organization/client, reused automatically
// for every future report for them (same intent as the style profile).
app.get('/api/author/branding/:organizationId', requireAuth, async (req, res) => {
    try {
        const { organizationId } = req.params;
        const row = await dbGet('SELECT accent_color, template, logo_path FROM author_branding WHERE organization_id = $1', [organizationId]);
        if (!row) {
            return res.json({ accentColor: '#5b8c8a', template: 'modern', logoUrl: null });
        }
        res.json({
            accentColor: row.accent_color,
            template: row.template,
            logoUrl: row.logo_path ? await storage.getSignedUrl(row.logo_path) : null
        });
    } catch (err) {
        console.error('Error fetching author branding:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/author/branding/:organizationId', requireAuth, async (req, res) => {
    try {
        const { organizationId } = req.params;
        const { accentColor, template } = req.body;
        await pool.query(
            `INSERT INTO author_branding (organization_id, accent_color, template, updated_at)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
             ON CONFLICT (organization_id) DO UPDATE SET
                accent_color = EXCLUDED.accent_color, template = EXCLUDED.template, updated_at = CURRENT_TIMESTAMP`,
            [organizationId, accentColor || '#5b8c8a', template || 'modern']
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving author branding:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

const uploadBrandLogo = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed for a logo'), false);
    }
});

app.post('/api/author/branding/:organizationId/logo', requireAuth,
    (req, res, next) => {
        uploadBrandLogo.single('logo')(req, res, (err) => {
            if (!err) return next();
            if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Logo exceeds the 5MB limit.' });
            return res.status(400).json({ error: err.message });
        });
    },
    async (req, res) => {
        try {
            const { organizationId } = req.params;
            if (!req.file) return res.status(400).json({ error: 'No logo file provided' });

            const existing = await dbGet('SELECT logo_path FROM author_branding WHERE organization_id = $1', [organizationId]);
            const ext = (req.file.originalname.split('.').pop() || 'png').toLowerCase();
            const logoPath = `branding/org_${organizationId}/logo_${Date.now()}.${ext}`;
            await storage.uploadFile(logoPath, req.file.buffer, req.file.mimetype);
            if (existing && existing.logo_path) await storage.deleteFile(existing.logo_path);

            await pool.query(
                `INSERT INTO author_branding (organization_id, logo_path, updated_at)
                 VALUES ($1, $2, CURRENT_TIMESTAMP)
                 ON CONFLICT (organization_id) DO UPDATE SET logo_path = EXCLUDED.logo_path, updated_at = CURRENT_TIMESTAMP`,
                [organizationId, logoPath]
            );
            res.json({ success: true, logoUrl: await storage.getSignedUrl(logoPath) });
        } catch (err) {
            console.error('Error uploading brand logo:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    }
);

// GET /api/worksrequired
app.get('/api/worksrequired', requireAuth, async (req, res) => {
    try {
        const { structureId, date } = req.query;

        const inspection = await dbGet(`
            SELECT id, structure_id, structure_name, inspection_date
            FROM inspections
            WHERE structure_id = $1 AND inspection_date = $2
        `, [structureId, date]);

        if (!inspection) {
            return res.status(404).json({ error: 'Inspection not found' });
        }

        const worksRequired = await dbAll(`
            SELECT 
                id,
                span_number as spanNumber,
                element_no as elementNumber,
                element_description as elementDescription,
                defect_no as defectNumber,
                works_required as worksRequired,
                priority,
                cost,
                remedial_works as remedialWorks,
                comments
            FROM defects
            WHERE inspection_id = $1
            AND works_required = 'Y'
            ORDER BY span_number, element_no
        `, [inspection.id]);

        const response = {
            inspection: {
                id: inspection.id,
                structureId: inspection.structure_id,
                structureName: inspection.structure_name,
                date: inspection.inspection_date
            },
            worksRequired: worksRequired.map(item => ({
                ...item,
                worksRequired: item.worksRequired,
                cost: item.cost ? `£${Number(item.cost).toFixed(2)}` : 'Not specified'
            })),
            count: worksRequired.length
        };

        res.json(response);
    } catch (err) {
        res.status(500).json({ 
            error: 'Internal server error',
            details: err.message 
        });
    }
});

//Testing.

// Buffered in memory, then uploaded to Supabase Storage inside the route
// handler (same reasoning as buildDocStoragePath above).
function buildInspectionPhotoStoragePath(structureId, inspectionDate, originalname) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    return `bridge_${structureId}/inspections/${inspectionDate}/photo-${uniqueSuffix}${path.extname(originalname)}`;
}

const uploadInspectionPhotos = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Photo upload endpoint
app.post('/api/bridges/:structureId/inspection-photos', requireAuth,
    (req, res, next) => {
        uploadInspectionPhotos.array('photos', 20)(req, res, (err) => {
            if (!err) return next();
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ success: false, error: 'Photo exceeds the 15MB limit.' });
            }
            return res.status(400).json({ success: false, error: err.message });
        });
    },
    async (req, res) => {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ 
                    success: false,
                    error: 'No files were uploaded' 
                });
            }

            // multer/busboy only produces an array when a field name repeats
            // more than once - a single file's descriptions/displayOrders
            // field arrives as a bare string, and indexing a string with [0]
            // silently returns its first CHARACTER instead of the whole
            // value. Normalizing to an array avoids that one-photo trap.
            const descriptions = [].concat(req.body.descriptions || []);
            const displayOrders = [].concat(req.body.displayOrders || []);
            const defectId = req.body.defectId;
            const { structureId } = req.params;
            const inspectionDate = req.body.inspectionDate || new Date().toISOString().split('T')[0];

            // A brand-new defect (not saved yet) is identified by a temporary
            // composite key, not a real id — its photos can only be linked up
            // once the whole inspection is saved (see /save-inspection). An
            // existing defect already has a real numeric id, so its photos
            // can be persisted immediately instead of waiting.
            let realDefectId = null;
            // 'general' is the reserved defectId for a site photo that isn't
            // tied to any defect - if the inspection already exists, link it
            // to the inspection itself right away (same idea as realDefectId
            // below); otherwise it's finalized later via /save-inspection's
            // photoData['general'].
            let generalInspectionId = null;
            if (defectId === 'general') {
                const existingInspection = await dbGet(
                    'SELECT id FROM inspections WHERE structure_id = $1 AND inspection_date = $2',
                    [structureId, inspectionDate]
                );
                if (existingInspection) generalInspectionId = existingInspection.id;
            } else if (defectId && /^\d+$/.test(defectId)) {
                const existing = await dbGet('SELECT id FROM defects WHERE id = $1', [defectId]);
                if (existing) realDefectId = existing.id;
            }

            const uploadedFiles = [];
            for (let index = 0; index < req.files.length; index++) {
                const file = req.files[index];
                const url = buildInspectionPhotoStoragePath(structureId, inspectionDate, file.originalname);
                await storage.uploadFile(url, file.buffer, file.mimetype);
                const photo_description = descriptions[index] || '';
                const display_order = displayOrders[index] || index;
                let photoId = null;

                if (realDefectId) {
                    const inserted = await dbGet(
                        `INSERT INTO defect_photos (
                            defect_id, photo_url, photo_description, display_order,
                            file_name, file_size, file_type
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                        [realDefectId, url, photo_description, display_order, file.originalname, file.size, file.mimetype]
                    );
                    photoId = inserted.id;
                } else if (generalInspectionId) {
                    const inserted = await dbGet(
                        `INSERT INTO defect_photos (
                            inspection_id, photo_url, photo_description, display_order,
                            file_name, file_size, file_type
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                        [generalInspectionId, url, photo_description, display_order, file.originalname, file.size, file.mimetype]
                    );
                    photoId = inserted.id;
                }

                uploadedFiles.push({
                    id: photoId,
                    originalName: file.originalname,
                    filename: path.basename(url),
                    path: url,
                    size: file.size,
                    mimetype: file.mimetype,
                    // The bucket is private - callers need a signed URL to
                    // actually display the image, not the bare storage path
                    // that gets stored in the DB (that part was fine; this
                    // response just never signed it before handing it back).
                    url: await storage.getSignedUrl(url),
                    photo_description,
                    display_order,
                    file_name: file.originalname,
                    file_type: file.mimetype,
                    saved: !!(realDefectId || generalInspectionId)
                });
            }

            res.status(200).json({
                success: true,
                photoUrls: uploadedFiles.map(file => file.url),
                photos: uploadedFiles,
                message: 'Photos uploaded successfully'
            });

        } catch (error) {
            console.error('Photo upload error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

// Photo retrieval endpoint
app.get('/api/bridges/:structureId/inspection-photos', requireAuth, async (req, res) => {
    try {
        const { structureId } = req.params;
        const { inspectionDate } = req.query;

        const inspection = await dbGet(
            `SELECT id FROM inspections 
             WHERE structure_id = $1 AND inspection_date = $2`,
            [structureId, inspectionDate]
        );

        if (!inspection) {
            return res.status(404).json({ 
                success: false,
                error: 'Inspection not found' 
            });
        }

        const photos = await dbAll(
            `SELECT dp.* FROM defect_photos dp
             LEFT JOIN defects d ON dp.defect_id = d.id
             WHERE d.inspection_id = $1 OR dp.inspection_id = $1`,
            [inspection.id]
        );

        const signedPhotos = await Promise.all(photos.map(async photo => ({
            photo_id: photo.id,
            defect_id: photo.defect_id,
            inspection_id: photo.inspection_id,
            front_defectid: photo.front_defectid,
            photo_url: await storage.getSignedUrl(photo.photo_url),
            photo_description: photo.photo_description,
            display_order: photo.display_order,
            file_name: photo.file_name,
            file_size: photo.file_size,
            file_type: photo.file_type,
            uploaded_at: photo.uploaded_at
        })));

        res.json({
            success: true,
            photos: signedPhotos
        });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({
            success: false,
            error: 'Database error'
        });
    }
});

// Photos for a single defect - lazy-fetched by twinView's defect popup
// (only signs URLs for the one defect actually clicked, rather than every
// defect on the bridge up front).
app.get('/api/defects/:defectId/photos', requireAuth, async (req, res) => {
    try {
        const photos = await dbAll(
            `SELECT id, photo_url, photo_description, display_order
             FROM defect_photos WHERE defect_id = $1
             ORDER BY display_order`,
            [req.params.defectId]
        );
        const signedPhotos = await Promise.all(photos.map(async photo => ({
            id: photo.id,
            url: await storage.getSignedUrl(photo.photo_url),
            description: photo.photo_description
        })));
        res.json({ photos: signedPhotos });
    } catch (err) {
        console.error('Defect photos error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete an entire inspection - cascades through defect_photos, defects and
// inspection_spans (none of these have DB-level ON DELETE CASCADE set up,
// so it's done manually here, in a transaction so a failure partway through
// doesn't leave things half-deleted). Storage file cleanup happens after
// the transaction commits and is best-effort per photo - a missing/already-
// gone file shouldn't roll back an otherwise-successful deletion of the
// real records.
app.delete('/api/inspections/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const inspection = await client.query('SELECT id FROM inspections WHERE id = $1', [id]);
        if (inspection.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Inspection not found' });
        }

        const photos = await client.query(
            `SELECT dp.photo_url FROM defect_photos dp
             JOIN defects d ON dp.defect_id = d.id
             WHERE d.inspection_id = $1
             UNION
             SELECT photo_url FROM defect_photos WHERE inspection_id = $1`,
            [id]
        );

        await client.query(
            `DELETE FROM defect_photos WHERE defect_id IN (SELECT id FROM defects WHERE inspection_id = $1) OR inspection_id = $1`,
            [id]
        );
        await client.query('DELETE FROM defects WHERE inspection_id = $1', [id]);
        await client.query('DELETE FROM inspection_spans WHERE inspection_id = $1', [id]);
        await client.query('DELETE FROM inspections WHERE id = $1', [id]);

        await client.query('COMMIT');

        for (const photo of photos.rows) {
            try { await storage.deleteFile(photo.photo_url); }
            catch (err) { console.error('Failed to delete storage file during inspection delete:', photo.photo_url, err.message); }
        }

        res.json({ success: true, photosDeleted: photos.rows.length });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Delete inspection error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
});

// Delete a single already-uploaded inspection photo (DB row + file on disk)
app.delete('/api/inspection-photos/:photoId', requireAuth, async (req, res) => {
    try {
        const { photoId } = req.params;
        const photo = await dbGet('SELECT photo_url FROM defect_photos WHERE id = $1', [photoId]);
        if (!photo) {
            return res.status(404).json({ success: false, error: 'Photo not found' });
        }

        await pool.query('DELETE FROM defect_photos WHERE id = $1', [photoId]);

        await storage.deleteFile(photo.photo_url);

        res.json({ success: true });
    } catch (err) {
        console.error('Delete photo error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update an already-uploaded photo's description, and/or reassign it to a
// different defect (or back to being a general/inspection-level photo).
app.patch('/api/inspection-photos/:photoId', requireAuth, async (req, res) => {
    try {
        const { photoId } = req.params;
        const { photo_description, defect_id, inspection_id } = req.body;

        const sets = [];
        const values = [];
        let i = 1;
        if (photo_description !== undefined) {
            sets.push(`photo_description = $${i++}`);
            values.push(photo_description || '');
        }
        // A photo is either tied to a defect (defect_id set, inspection_id
        // NULL) or general (inspection_id set, defect_id NULL) - reassigning
        // one always clears the other so a photo can't end up claimed by both.
        if (defect_id !== undefined) {
            sets.push(`defect_id = $${i++}`, `inspection_id = NULL`);
            values.push(defect_id);
        } else if (inspection_id !== undefined) {
            sets.push(`inspection_id = $${i++}`, `defect_id = NULL`);
            values.push(inspection_id);
        }
        if (!sets.length) {
            return res.status(400).json({ success: false, error: 'Nothing to update' });
        }
        values.push(photoId);

        const result = await pool.query(
            `UPDATE defect_photos SET ${sets.join(', ')} WHERE id = $${i}`,
            values
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, error: 'Photo not found' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Update photo error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

//Authentication code.
// (session middleware itself is registered near the top of the file,
// before any routes - see the comment by `const app = express();`)

// AUTHENTICATION MIDDLEWARE
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized - Please log in' });
    }
}

// Admin is let through too: it's the only account guaranteed to exist (see
// the seed insert above), and there's no role-management UI yet to grant
// 'engineer' to anyone else.
function requireEngineer(req, res, next) {
    if (req.session && (req.session.role === 'engineer' || req.session.role === 'admin')) {
        next();
    } else {
        res.status(403).json({ error: 'Forbidden - engineer role required' });
    }
}

function requireAdmin(req, res, next) {
    if (req.session && req.session.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Forbidden - admin role required' });
    }
}

// Unlike the 2FA code-verify step just below (which already caps attempts
// per pending login at 5), the password step itself had no limit at all -
// unbounded brute-force guessing against any account. Keyed by IP only
// (not IP+username) to avoid the extra complexity/edge cases of a compound
// key; 10 attempts/15min is generous for a real user, tight for a guesser.
const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many login attempts. Please try again in a few minutes.' }
});

// LOGIN ENDPOINT
app.post('/api/login', loginRateLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;


        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username and password required' 
            });
        }

        const user = await dbGet(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );

        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid username or password' 
            });
        }

        const passwordMatches = await bcrypt.compare(password, user.password);

        if (passwordMatches) {
            if (user.totp_enabled) {
                // Correct password, but a second factor is still required -
                // req.session.userId is deliberately NOT set yet, so
                // requireAuth keeps rejecting every other route until
                // /api/login/2fa succeeds.
                req.session.pendingUserId = user.id;
                req.session.pendingAttempts = 0;
                return res.json({ success: true, requires2FA: true });
            }

            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.organizationId = user.organization_id;
            req.session.role = user.role;


            await pool.query(
                'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
                [user.id]
            );

            res.json({
                success: true,
                user: {
                    username: user.username,
                    role: user.role,
                    fullName: user.full_name
                }
            });
        } else {
            res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Second step of login when the account has 2FA enabled - requires
// req.session.pendingUserId from /api/login above, so this can't be hit
// standalone without a correct password first.
app.post('/api/login/2fa', async (req, res) => {
    try {
        if (!req.session.pendingUserId) {
            return res.status(400).json({ success: false, message: 'No login in progress' });
        }

        const code = (req.body.code || '').trim();
        if (!/^\d{6}$/.test(code)) {
            return res.status(400).json({ success: false, message: 'Enter the 6-digit code from your authenticator app' });
        }

        // Basic brute-force guard - 5 wrong codes and the pending login is
        // discarded, forcing a fresh username/password attempt.
        req.session.pendingAttempts = (req.session.pendingAttempts || 0) + 1;
        if (req.session.pendingAttempts > 5) {
            delete req.session.pendingUserId;
            delete req.session.pendingAttempts;
            return res.status(429).json({ success: false, message: 'Too many attempts - please sign in again' });
        }

        const user = await dbGet('SELECT * FROM users WHERE id = $1', [req.session.pendingUserId]);
        if (!user || !user.totp_enabled || !user.totp_secret) {
            delete req.session.pendingUserId;
            delete req.session.pendingAttempts;
            return res.status(400).json({ success: false, message: 'No login in progress' });
        }

        if (!authenticator.check(code, user.totp_secret)) {
            return res.status(401).json({ success: false, message: 'Incorrect code' });
        }

        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.organizationId = user.organization_id;
        req.session.role = user.role;
        delete req.session.pendingUserId;
        delete req.session.pendingAttempts;

        await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

        res.json({
            success: true,
            user: { username: user.username, role: user.role, fullName: user.full_name }
        });
    } catch (err) {
        console.error('2FA login error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// LOGOUT ENDPOINT
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ success: false });
        }
        res.json({ success: true });
    });
});

// CHECK SESSION ENDPOINT
app.get('/api/check-session', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({
            loggedIn: true,
            userId: req.session.userId,
            username: req.session.username,
            organizationId: req.session.organizationId,
            role: req.session.role
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// Fuller profile data for the account page — kept separate from
// check-session (which only carries minimal session identity) rather than
// growing that endpoint's payload for something only the account page needs.
app.get('/api/me', requireAuth, async (req, res) => {
    try {
        const user = await dbGet(
            'SELECT username, full_name, role, created_at, email, phone, last_login, totp_enabled, password_changed_at, avatar_path FROM users WHERE id = $1',
            [req.session.userId]
        );
        if (!user) return res.status(404).json({ error: 'User not found' });
        const { avatar_path, ...rest } = user;
        res.json({ ...rest, avatarUrl: avatar_path ? await storage.getSignedUrl(avatar_path) : null });
    } catch (err) {
        console.error('Fetch /api/me error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Lets a user edit their own name/email/phone. Deliberately does not accept
// `role` here (even if a client sends one) - the account page's "Job Title"
// field displays this same column, and it doubles as the permission level
// checked by requireAdmin/requireEngineer elsewhere, so it must only ever
// be changed by an admin through a dedicated admin flow, never by the user
// editing their own profile.
app.put('/api/me', requireAuth, async (req, res) => {
    try {
        const fullName = (req.body.full_name || '').trim();
        const email = (req.body.email || '').trim();
        const phone = (req.body.phone || '').trim();

        if (!fullName) {
            return res.status(400).json({ error: 'Full name is required' });
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Invalid email address' });
        }

        await dbRun(
            'UPDATE users SET full_name = $1, email = $2, phone = $3 WHERE id = $4',
            [fullName, email, phone, req.session.userId]
        );

        const user = await dbGet(
            'SELECT username, full_name, role, created_at, email, phone, last_login, totp_enabled, password_changed_at, avatar_path FROM users WHERE id = $1',
            [req.session.userId]
        );
        const { avatar_path, ...rest } = user;
        res.json({ ...rest, avatarUrl: avatar_path ? await storage.getSignedUrl(avatar_path) : null });
    } catch (err) {
        console.error('Update /api/me error:', err);
        res.status(500).json({ error: err.message });
    }
});

const uploadAvatar = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed'), false);
    }
});

// Profile photo - same replace-on-upload pattern as the Author branding logo
// above (uploadFile the new one, delete the old object, store the new path).
app.post('/api/me/avatar', requireAuth,
    (req, res, next) => {
        uploadAvatar.single('avatar')(req, res, (err) => {
            if (!err) return next();
            if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Photo exceeds the 5MB limit.' });
            return res.status(400).json({ error: err.message });
        });
    },
    async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'No photo provided' });
            const existing = await dbGet('SELECT avatar_path FROM users WHERE id = $1', [req.session.userId]);
            const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
            const avatarPath = `avatars/user_${req.session.userId}/avatar_${Date.now()}.${ext}`;
            await storage.uploadFile(avatarPath, req.file.buffer, req.file.mimetype);
            if (existing && existing.avatar_path) await storage.deleteFile(existing.avatar_path);
            await dbRun('UPDATE users SET avatar_path = $1 WHERE id = $2', [avatarPath, req.session.userId]);
            res.json({ success: true, avatarUrl: await storage.getSignedUrl(avatarPath) });
        } catch (err) {
            console.error('Upload avatar error:', err);
            res.status(500).json({ error: err.message });
        }
    }
);

// ============================================
// TWO-FACTOR AUTHENTICATION (TOTP - Google/Microsoft Authenticator compatible)
// ============================================

// Starts (or restarts) 2FA setup: generates a new secret and stores it
// unconfirmed (totp_enabled stays false) - nothing is actually enabled
// until /api/me/2fa/verify succeeds, so an abandoned setup or a re-scan
// just replaces the pending secret rather than half-enabling 2FA.
app.post('/api/me/2fa/setup', requireAuth, async (req, res) => {
    try {
        const user = await dbGet('SELECT username FROM users WHERE id = $1', [req.session.userId]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const secret = authenticator.generateSecret();
        await dbRun('UPDATE users SET totp_secret = $1, totp_enabled = false WHERE id = $2', [secret, req.session.userId]);

        const otpauthUrl = authenticator.keyuri(user.username, 'spanSense', secret);
        res.json({ secret, otpauthUrl });
    } catch (err) {
        console.error('2FA setup error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Confirms setup - the user has to prove they can generate a valid code
// from the secret (i.e. it's really in their authenticator app) before it
// starts being required at login.
app.post('/api/me/2fa/verify', requireAuth, async (req, res) => {
    try {
        const code = (req.body.code || '').trim();
        if (!/^\d{6}$/.test(code)) {
            return res.status(400).json({ error: 'Enter the 6-digit code from your authenticator app' });
        }

        const user = await dbGet('SELECT totp_secret FROM users WHERE id = $1', [req.session.userId]);
        if (!user || !user.totp_secret) {
            return res.status(400).json({ error: 'No 2FA setup in progress - start setup again' });
        }

        if (!authenticator.check(code, user.totp_secret)) {
            return res.status(401).json({ error: 'Incorrect code' });
        }

        await dbRun('UPDATE users SET totp_enabled = true WHERE id = $1', [req.session.userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('2FA verify error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Disabling removes a security control, so it requires re-entering the
// current password rather than a bare click - the same bar as changing it.
app.post('/api/me/2fa/disable', requireAuth, async (req, res) => {
    try {
        const password = req.body.password || '';
        const user = await dbGet('SELECT password FROM users WHERE id = $1', [req.session.userId]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const passwordMatches = await bcrypt.compare(password, user.password);
        if (!passwordMatches) {
            return res.status(401).json({ error: 'Incorrect password' });
        }

        await dbRun('UPDATE users SET totp_enabled = false, totp_secret = NULL WHERE id = $1', [req.session.userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('2FA disable error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Lets a user change their own password. Requires the current password
// (not just an active session) so a hijacked but unattended session can't
// be used to lock the real owner out by silently swapping the password.
app.post('/api/me/password', requireAuth, async (req, res) => {
    try {
        const currentPassword = req.body.currentPassword || '';
        const newPassword = req.body.newPassword || '';

        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters' });
        }

        const user = await dbGet('SELECT password FROM users WHERE id = $1', [req.session.userId]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const passwordMatches = await bcrypt.compare(currentPassword, user.password);
        if (!passwordMatches) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        const sameAsOld = await bcrypt.compare(newPassword, user.password);
        if (sameAsOld) {
            return res.status(400).json({ error: 'New password must be different from your current password' });
        }

        const newHash = await bcrypt.hash(newPassword, 12);
        await dbRun(
            'UPDATE users SET password = $1, password_changed_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newHash, req.session.userId]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Password change error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 2. BCI Distribution - Simplified
app.get('/api/bci-distribution', requireAuth, async (req, res) => {
    try {
        const rows = await dbAll(`
            WITH latest_inspections AS (
                SELECT 
                    i.structure_id,
                    i.id as inspection_id,
                    s.bci_av
                FROM inspections i
                JOIN (
                    SELECT structure_id, MAX(inspection_date) as latest_date
                    FROM inspections
                    GROUP BY structure_id
                ) latest ON i.structure_id = latest.structure_id 
                         AND i.inspection_date = latest.latest_date
                JOIN inspection_spans s ON i.id = s.inspection_id
                WHERE s.bci_av IS NOT NULL
            ),
            bci_ranges AS (
                SELECT 
                    structure_id,
                    CASE
                        WHEN bci_av < 40 THEN '0-39'
                        WHEN bci_av >= 40 AND bci_av < 65 THEN '40-64'
                        WHEN bci_av >= 65 AND bci_av < 80 THEN '65-79'
                        WHEN bci_av >= 80 AND bci_av < 90 THEN '80-89'
                        ELSE '90-100'
                    END as bci_range
                FROM latest_inspections
            )
            SELECT 
                bci_range,
                COUNT(DISTINCT structure_id) as count
            FROM bci_ranges
            GROUP BY bci_range
            ORDER BY
                CASE bci_range
                    WHEN '0-39' THEN 1
                    WHEN '40-64' THEN 2
                    WHEN '65-79' THEN 3
                    WHEN '80-89' THEN 4
                    WHEN '90-100' THEN 5
                END
        `);

        const ranges = ['0-39', '40-64', '65-79', '80-89', '90-100'];
        const result = ranges.map(range => {
            const found = rows.find(r => r.bci_range === range);
            return { bci_range: range, count: found ? parseInt(found.count) : 0 };
        });

        res.json({ success: true, data: result });
    } catch (err) {
        console.error('BCI distribution error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Condition Distribution Over Time - YEARLY
app.get('/api/condition-distribution', requireAuth, async (req, res) => {
    try {
        const rows = await dbAll(`
            WITH yearly_latest AS (
                SELECT 
                    i.structure_id,
                    EXTRACT(YEAR FROM i.inspection_date)::INTEGER as year,
                    MAX(i.inspection_date) as latest_date
                FROM inspections i
                JOIN inspection_spans s ON i.id = s.inspection_id
                WHERE s.bci_av IS NOT NULL
                GROUP BY i.structure_id, EXTRACT(YEAR FROM i.inspection_date)::INTEGER
            ),
            yearly_bci AS (
                SELECT 
                    y.year,
                    s.bci_av
                FROM yearly_latest y
                JOIN inspections i ON i.structure_id = y.structure_id AND i.inspection_date = y.latest_date
                JOIN inspection_spans s ON i.id = s.inspection_id
                WHERE s.bci_av IS NOT NULL
            )
            SELECT 
                year as period,
                SUM(CASE WHEN bci_av >= 90 THEN 1 ELSE 0 END) as very_good,
                SUM(CASE WHEN bci_av >= 80 AND bci_av < 90 THEN 1 ELSE 0 END) as good,
                SUM(CASE WHEN bci_av >= 65 AND bci_av < 80 THEN 1 ELSE 0 END) as fair,
                SUM(CASE WHEN bci_av >= 40 AND bci_av < 65 THEN 1 ELSE 0 END) as poor,
                SUM(CASE WHEN bci_av < 40 THEN 1 ELSE 0 END) as very_poor,
                COUNT(*) as total_bridges
            FROM yearly_bci
            GROUP BY year
            ORDER BY year ASC
        `);

        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Condition distribution error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET ALL INSPECTIONS (list for export page)
app.get('/api/inspections', requireAuth, async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT id, structure_id, structure_name, inspection_date,
                    inspection_type, inspector_name, total_spans,
                    created_at, conclusions, overall_bcicrit, overall_bciave, source,
                    (SELECT COUNT(*) FROM defects WHERE defects.inspection_id = inspections.id) AS defect_count
            FROM inspections
            ORDER BY inspection_date DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// "Poor" bridges: lowest BCI per structure - BCI avg < 65, the Poor and
// Very Poor bands from the BCI Score Distribution legend merged into one
// list. Keyed off overall_bciave, not overall_bcicrit, to match the rest
// of the dashboard's headline metric.
app.get('/api/dashboard/critical-bridges', requireAuth, async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT
                i.structure_id,
                i.structure_name,
                i.inspection_date,
                i.overall_bciave,
                i.overall_bcicrit
            FROM inspections i
            INNER JOIN (
                SELECT structure_id, MAX(inspection_date) as latest_date
                FROM inspections
                GROUP BY structure_id
            ) latest ON i.structure_id = latest.structure_id
                   AND i.inspection_date = latest.latest_date
            WHERE i.overall_bciave IS NOT NULL
              AND i.overall_bciave < 65
            ORDER BY i.overall_bciave ASC
            LIMIT 10
        `);

        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Critical bridges error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Portfolio-wide BCI average and critical average, over each structure's
// latest inspection (same latest-inspection join as critical-bridges above).
app.get('/api/dashboard/bci-summary', requireAuth, async (req, res) => {
    try {
        const row = await dbGet(`
            WITH latest_inspections AS (
                SELECT i.overall_bciave, i.overall_bcicrit
                FROM inspections i
                INNER JOIN (
                    SELECT structure_id, MAX(inspection_date) as latest_date
                    FROM inspections
                    GROUP BY structure_id
                ) latest ON i.structure_id = latest.structure_id
                       AND i.inspection_date = latest.latest_date
            )
            SELECT
                ROUND(AVG(overall_bciave)::numeric, 1) as avg_bci,
                ROUND(AVG(overall_bcicrit)::numeric, 1) as avg_bci_crit
            FROM latest_inspections
        `);

        res.json({
            success: true,
            avgBci: row && row.avg_bci !== null ? parseFloat(row.avg_bci) : null,
            avgBciCrit: row && row.avg_bci_crit !== null ? parseFloat(row.avg_bci_crit) : null
        });
    } catch (err) {
        console.error('BCI summary error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Average BCI per structure type, using each structure's latest inspection
app.get('/api/dashboard/avg-bci-by-type', requireAuth, async (req, res) => {
    try {
        const rows = await dbAll(`
            WITH latest_inspections AS (
                SELECT
                    i.structure_id,
                    s.bci_av
                FROM inspections i
                JOIN (
                    SELECT structure_id, MAX(inspection_date) as latest_date
                    FROM inspections
                    GROUP BY structure_id
                ) latest ON i.structure_id = latest.structure_id
                         AND i.inspection_date = latest.latest_date
                JOIN inspection_spans s ON i.id = s.inspection_id
                WHERE s.bci_av IS NOT NULL
            )
            SELECT
                b.type,
                ROUND(AVG(li.bci_av)::numeric, 1) as avg_bci,
                COUNT(DISTINCT li.structure_id) as count
            FROM latest_inspections li
            JOIN bridges b ON b.id = li.structure_id
            GROUP BY b.type
            ORDER BY avg_bci DESC
        `);

        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Average BCI by type error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ---- Deterioration forecast ----
// Ordinary least-squares fit (v = slope*t + intercept), t in epoch ms.
// Mirrors twin/twin.js's linearFit() exactly - same algorithm, ported here
// rather than shared, since that one only ever runs client-side against a
// single structure's data already in the page, and this needs to run
// server-side across every structure/category in one request.
function forecastLinearFit(pts) {
    const n = pts.length;
    if (n < 3) return null;
    let sumT = 0, sumV = 0, sumTT = 0, sumTV = 0;
    pts.forEach(p => { sumT += p.t; sumV += p.v; sumTT += p.t * p.t; sumTV += p.t * p.v; });
    const denom = n * sumTT - sumT * sumT;
    if (denom === 0) return null;
    const slope = (n * sumTV - sumT * sumV) / denom;
    const intercept = (sumV - slope * sumT) / n;
    return { slope, intercept };
}

// "Poor" here means BCI avg < 65 - the Poor and Very Poor bands from the
// BCI Score Distribution legend merged into one alert threshold, since
// splitting the two into separate lists added a distinction without much
// practical difference. Matches the dashboard's "Poor" structures list
// below, which uses the same cutoff.
const FORECAST_THRESHOLD_BCIAVE = 65;
const FORECAST_HORIZON_YEARS = 5;
const FORECAST_MIN_POINTS = 3;
const FORECAST_YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

// currentAvg/series describe one group (a single structure, or a
// category's/the portfolio's year-bucketed average) - same rules apply at
// every granularity, only what got averaged before this runs differs.
function buildForecastStatus(currentAvg, series) {
    if (currentAvg != null && currentAvg < FORECAST_THRESHOLD_BCIAVE) {
        return { status: 'already_critical' };
    }
    if (series.length < FORECAST_MIN_POINTS) {
        return { status: 'insufficient_history' };
    }
    const fit = forecastLinearFit(series);
    if (!fit) {
        return { status: 'no_decline' };
    }
    // BCI points per year - lets the client extend a dashed line past the
    // last real reading on the history sparkline, not just used for the
    // crossing-date maths below.
    const slopePerYear = Math.round(fit.slope * FORECAST_YEAR_MS * 100) / 100;
    if (fit.slope >= 0) {
        return { status: 'no_decline', slopePerYear };
    }
    const now = Date.now();
    const tCross = (FORECAST_THRESHOLD_BCIAVE - fit.intercept) / fit.slope;
    const yearsToThreshold = Math.max(0, (tCross - now) / FORECAST_YEAR_MS);
    if (yearsToThreshold > FORECAST_HORIZON_YEARS) {
        return { status: 'beyond_horizon', slopePerYear };
    }
    return {
        status: 'projected',
        projectedCrossingDate: new Date(Math.max(tCross, now)).toISOString().slice(0, 7),
        yearsToThreshold: Math.round(yearsToThreshold * 10) / 10,
        slopePerYear
    };
}

// Trims a {t (epoch ms), v, min?, max?}[] series down to what a sparkline
// actually needs on the wire - ISO date + one decimal place, not the full
// float and millisecond timestamp precision the fit itself used. min/max
// (portfolio only - the shaded spread band) pass through when present.
function seriesForClient(series) {
    return series.map(p => {
        const out = { t: new Date(p.t).toISOString().slice(0, 10), v: Math.round(p.v * 10) / 10 };
        if (p.min != null) out.min = Math.round(p.min * 10) / 10;
        if (p.max != null) out.max = Math.round(p.max * 10) / 10;
        return out;
    });
}

app.get('/api/dashboard/deterioration-forecast', requireAuth, async (req, res) => {
    try {
        const granularity = ['structures', 'category', 'portfolio'].includes(req.query.granularity)
            ? req.query.granularity : 'structures';

        if (granularity === 'structures') {
            const historyRows = await dbAll(`
                SELECT i.structure_id, b.name AS structure_name, b.type,
                       i.inspection_date, i.overall_bciave
                FROM inspections i
                JOIN bridges b ON b.id = i.structure_id
                WHERE i.overall_bciave IS NOT NULL
                ORDER BY i.structure_id, i.inspection_date ASC
            `);
            const byStructure = new Map();
            historyRows.forEach(r => {
                if (!byStructure.has(r.structure_id)) {
                    byStructure.set(r.structure_id, {
                        structureId: r.structure_id, structureName: r.structure_name, type: r.type,
                        series: [], historySince: null
                    });
                }
                const g = byStructure.get(r.structure_id);
                g.series.push({ t: new Date(r.inspection_date).getTime(), v: parseFloat(r.overall_bciave) });
                if (g.historySince == null) g.historySince = new Date(r.inspection_date).getFullYear();
            });

            const rows = [];
            byStructure.forEach(g => {
                const last = g.series[g.series.length - 1];
                const forecast = buildForecastStatus(last.v, g.series);
                // This list is specifically "heading toward Very Poor" - only
                // an actual declining fit belongs here. Already-critical
                // belongs on the Very Poor list instead; no_decline and
                // insufficient_history aren't heading anywhere, so listing
                // them here under this title would read as a false alarm.
                if (forecast.status !== 'projected' && forecast.status !== 'beyond_horizon') return;
                rows.push({
                    structureId: g.structureId, structureName: g.structureName, type: g.type,
                    currentBciAve: Math.round(last.v * 10) / 10, dataPoints: g.series.length,
                    historySince: g.historySince, series: seriesForClient(g.series), ...forecast
                });
            });
            rows.sort((a, b) => (a.yearsToThreshold ?? 999) - (b.yearsToThreshold ?? 999));
            return res.json({ granularity, withinYears: FORECAST_HORIZON_YEARS, thresholdBciAve: FORECAST_THRESHOLD_BCIAVE, rows });
        }

        if (granularity === 'portfolio') {
            // One row, one properly time-ordered series blended across every
            // type - deliberately a separate query from category's rather
            // than reusing its (type, year) grouped rows ungrouped, which
            // used to concatenate each type's points back-to-back instead of
            // interleaving them by year (the zigzag sparkline bug). min/max
            // per year become the shaded spread band on the client.
            const historyRows = await dbAll(`
                SELECT date_trunc('year', i.inspection_date) AS yr,
                       AVG(i.overall_bciave) AS avg_bciave,
                       MIN(i.overall_bciave) AS min_bciave,
                       MAX(i.overall_bciave) AS max_bciave
                FROM inspections i
                WHERE i.overall_bciave IS NOT NULL
                GROUP BY yr
                ORDER BY yr
            `);
            const currentRows = await dbAll(`
                SELECT i.overall_bciave
                FROM inspections i
                INNER JOIN (
                    SELECT structure_id, MAX(inspection_date) as latest_date
                    FROM inspections GROUP BY structure_id
                ) latest ON i.structure_id = latest.structure_id AND i.inspection_date = latest.latest_date
                WHERE i.overall_bciave IS NOT NULL
            `);
            const series = historyRows.map(r => ({
                t: new Date(r.yr).getTime(), v: parseFloat(r.avg_bciave),
                min: parseFloat(r.min_bciave), max: parseFloat(r.max_bciave)
            }));
            const currentAvg = currentRows.length
                ? currentRows.reduce((sum, r) => sum + parseFloat(r.overall_bciave), 0) / currentRows.length
                : null;
            const forecast = buildForecastStatus(currentAvg, series);
            const row = {
                structureCount: currentRows.length,
                avgBciAve: currentAvg != null ? Math.round(currentAvg * 10) / 10 : null,
                dataPoints: series.length, series: seriesForClient(series), ...forecast
            };
            return res.json({ granularity, withinYears: FORECAST_HORIZON_YEARS, thresholdBciAve: FORECAST_THRESHOLD_BCIAVE, rows: [row] });
        }

        // category: same mechanism as structures, just averaged within each
        // type/year bucket before fitting (individual structures rarely
        // inspect on matching dates, so a per-year average is the simplest
        // common time axis to fit a trend through).
        const historyRows = await dbAll(`
            SELECT b.type, date_trunc('year', i.inspection_date) AS yr, AVG(i.overall_bciave) AS avg_bciave
            FROM inspections i JOIN bridges b ON b.id = i.structure_id
            WHERE i.overall_bciave IS NOT NULL AND b.type IS NOT NULL
            GROUP BY b.type, yr
            ORDER BY b.type, yr
        `);
        const currentRows = await dbAll(`
            SELECT b.type, i.overall_bciave, b.id AS structure_id
            FROM inspections i
            JOIN bridges b ON b.id = i.structure_id
            INNER JOIN (
                SELECT structure_id, MAX(inspection_date) as latest_date
                FROM inspections GROUP BY structure_id
            ) latest ON i.structure_id = latest.structure_id AND i.inspection_date = latest.latest_date
            WHERE i.overall_bciave IS NOT NULL AND b.type IS NOT NULL
        `);

        const groups = new Map();
        historyRows.forEach(r => {
            if (!groups.has(r.type)) groups.set(r.type, { type: r.type, series: [], currentSum: 0, structureCount: 0 });
            groups.get(r.type).series.push({ t: new Date(r.yr).getTime(), v: parseFloat(r.avg_bciave) });
        });
        currentRows.forEach(r => {
            if (!groups.has(r.type)) groups.set(r.type, { type: r.type, series: [], currentSum: 0, structureCount: 0 });
            const g = groups.get(r.type);
            g.currentSum += parseFloat(r.overall_bciave);
            g.structureCount += 1;
        });

        const rows = [];
        groups.forEach(g => {
            const currentAvg = g.structureCount ? g.currentSum / g.structureCount : null;
            const forecast = buildForecastStatus(currentAvg, g.series);
            // Same "only show it if it's actually heading there" rule as
            // structures above - category is a list of several rows same as
            // structures, unlike portfolio's single summary card where
            // "no decline detected" etc. is the direct answer to the only
            // question that card is asking, not noise in a list.
            if (forecast.status !== 'projected' && forecast.status !== 'beyond_horizon') return;
            rows.push({
                type: g.type, structureCount: g.structureCount,
                avgBciAve: currentAvg != null ? Math.round(currentAvg * 10) / 10 : null,
                dataPoints: g.series.length, series: seriesForClient(g.series), ...forecast
            });
        });
        rows.sort((a, b) => (a.yearsToThreshold ?? 999) - (b.yearsToThreshold ?? 999));
        res.json({ granularity, withinYears: FORECAST_HORIZON_YEARS, thresholdBciAve: FORECAST_THRESHOLD_BCIAVE, rows });
    } catch (err) {
        console.error('Deterioration forecast error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Recent activity feed: most recently submitted inspections
app.get('/api/dashboard/recent-activity', requireAuth, async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT
                structure_id,
                structure_name,
                inspector_name,
                created_at,
                overall_bciave,
                overall_bcicrit,
                status
            FROM inspections
            ORDER BY created_at DESC
            LIMIT 5
        `);

        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Recent activity error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Inspections awaiting engineer review (see the review/approval workflow
// columns added to `inspections` above).
app.get('/api/inspections/pending-review', requireAuth, requireEngineer, async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT id, structure_id, structure_name, inspection_date, inspection_type,
                   inspector_name, conclusions, overall_bcicrit, overall_bciave, created_at, source
            FROM inspections
            WHERE status = 'submitted'
            ORDER BY created_at ASC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Pending review error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Notes log for an already-saved inspection - see inspection_notes above.
// A brand-new, not-yet-saved inspection has no id to fetch/post against yet;
// its first notes travel in /save-inspection's `notes` array instead.
app.get('/api/inspections/:id/notes', requireAuth, async (req, res) => {
    try {
        const rows = await dbAll(
            `SELECT id, text, source, author, created_at
             FROM inspection_notes WHERE inspection_id = $1 ORDER BY created_at DESC`,
            [req.params.id]
        );
        res.json({ success: true, notes: rows });
    } catch (err) {
        console.error('Get notes error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/inspections/:id/notes', requireAuth, async (req, res) => {
    try {
        const text = (req.body.text || '').trim();
        if (!text) return res.status(400).json({ success: false, error: 'Note text is required' });
        const source = req.body.source === 'field' ? 'field' : 'core';
        const row = await dbGet(
            `INSERT INTO inspection_notes (inspection_id, text, source, author)
             VALUES ($1, $2, $3, $4) RETURNING id, text, source, author, created_at`,
            [req.params.id, text, source, req.session.username || null]
        );
        res.json({ success: true, note: row });
    } catch (err) {
        console.error('Add note error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Engineer's approve/reject decision on a submitted inspection.
app.post('/api/inspections/:id/review', requireAuth, requireEngineer, async (req, res) => {
    try {
        const { decision, comments } = req.body;
        if (!['approved', 'rejected'].includes(decision)) {
            return res.status(400).json({ success: false, message: 'Invalid decision' });
        }
        const reviewer = await dbGet('SELECT full_name, username FROM users WHERE id = $1', [req.session.userId]);
        const reviewedBy = reviewer?.full_name || reviewer?.username || 'Unknown';
        await pool.query(
            `UPDATE inspections SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP,
                                     engineer_comments = $3 WHERE id = $4`,
            [decision, reviewedBy, comments || '', req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Review decision error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});



// Backend-only paths that must never be downloadable. The frontend's pages
// and scripts are scattered across many top-level folders instead of one
// dedicated public/ directory, so express.static below has to serve the
// whole project root - without this denylist running first, anyone could
// curl /server.js or /supabaseStorage.js and read the entire backend
// source, every SQL query, and the storage bucket logic.
const STATIC_DENYLIST_PATTERNS = [
    /^\/server\.js$/i,
    /^\/supabasestorage\.js$/i,
    /^\/package(-lock)?\.json$/i,
    /^\/scripts(\/|$)/i,
    /^\/node_modules(\/|$)/i,
    /^\/certs(\/|$)/i
];
app.use((req, res, next) => {
    let normalized;
    try {
        normalized = path.posix.normalize(decodeURIComponent(req.path));
    } catch {
        return res.status(400).end();
    }
    if (STATIC_DENYLIST_PATTERNS.some(re => re.test(normalized))) {
        return res.status(404).end();
    }
    next();
});

// Serve frontend static files (must be before error handler and listen).
// no-cache (not "don't cache") — the browser still keeps the file and
// reuses it via a cheap 304 if the ETag matches, it just always asks first.
// A time-based max-age previously caused edited JS/CSS to keep being served
// stale for up to an hour after every deploy, which repeatedly looked like
// new features "not working" during active development.
app.use(express.static(path.join(__dirname), {
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-cache');
    }
}));

// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message });
});
