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

const router = express.Router();
const session = require('express-session');

const app = express();

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
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: false,
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

// PostgreSQL connection
// rejectUnauthorized was previously false in production, which encrypts the
// connection but never checks it's actually Supabase's pooler on the other
// end (accepts any cert, so a MITM on that hop would go unnoticed). Pinning
// Supabase's own Root 2021 CA (certs/supabase-ca.crt - their public root,
// captured directly from a live handshake with our own DB, not a
// third-party copy) lets us verify the chain properly instead.
const supabaseCA = fs.readFileSync(path.join(__dirname, 'certs', 'supabase-ca.crt'), 'utf8');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true, ca: supabaseCA } : false
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

        // Insert default admin user if table is empty
        const userCount = await dbGet("SELECT COUNT(*) as count FROM users");
        if (parseInt(userCount.count) === 0) {
            const defaultHash = await bcrypt.hash('admin123', 10);
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
                const hashed = await bcrypt.hash(u.password, 10);
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

        // Auto-resync all SERIAL sequences to prevent duplicate key errors
        await resyncSequences();

    } catch (err) {
        console.error('Database initialization error:', err);
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
        res.json({ photo_url: row.photo_url });
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
                COALESCE(inspection_type, 'Inspection') as type 
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
            timestamp: row.timestamp
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

// Updates the handful of structure facts inspection1.html's "Span Info"
// panel lets an inspector correct inline (description, span count, length,
// built year, material) - deliberately not the bridge's identity/location
// fields, which stay Database-page-only. Material is edited as one combined
// string rather than the two separate primary/secondary columns the rest of
// the app reads it from (see the getStructureIcon-style join elsewhere) -
// simplest to edit, and secondary_material is cleared here since whatever
// the inspector typed is now the full picture, not an addition to it.
app.patch('/api/bridges/:id/info', requireAuth, async (req, res) => {
    try {
        const { description, span_number, length, built_year, material } = req.body;
        await pool.query(
            `UPDATE bridges SET description = $1, span_number = $2, length = $3, built_year = $4,
                                 primary_material = $5, secondary_material = NULL
             WHERE id = $6`,
            [description || null, span_number || null, length || null, built_year || null, material || null, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Update bridge info error:', err);
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
                `SELECT span_number, element_no, severity, extent, defect_type, defect_number,
                        works_required, priority, cost, comments, remedial_works, pos_x, pos_y, pos_z
                 FROM defects WHERE inspection_id = $1
                 ORDER BY span_number, element_no`,
                [selectedInspection.id]
            );
            defects = defectRows.map(d => {
                const sev = parseInt(d.severity, 10);
                return {
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
                    z: d.pos_z !== null ? parseFloat(d.pos_z) : null
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

        const spanNumber = bridge.span_number || spans.length || 1;
        const material = [bridge.primary_material, bridge.secondary_material].filter(Boolean).join(' / ') || null;

        res.json({
            id: bridge.id,
            name: bridge.name,
            location: bridge.location,
            type: bridge.type,
            spans: spanNumber,
            spanLength: bridge.length ? bridge.length / spanNumber : null,
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
    const { inspection, defects, photoData = {} } = req.body;


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
        const inspectionResult = await client.query(
            `INSERT INTO inspections (
                structure_id, structure_name, inspection_date, 
                inspection_type, inspector_name, total_spans, conclusions,
                overall_bcicrit, overall_bciave
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [
                inspection.structure_id,
                inspection.structure_name,
                inspection.inspection_date,
                inspection.inspection_type,
                inspection.inspector_name,
                inspection.total_spans,
                inspection.conclusions || '',
                overallBciCrit,
                overallBciAve
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
    const { inspection, defects, inspectionId } = req.body;

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
        await client.query(
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
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $10`,
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
                inspectionId
            ]
        );

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
        res.json({ success: true, inspectionId });

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
                   overall_bcicrit, overall_bciave
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

        // 5. Format response
        const response = {
            structureId: inspection.structure_id,
            structureName: inspection.structure_name,
            inspectionDate: inspection.inspection_date,
            inspectionType: inspection.inspection_type,
            inspectorName: inspection.inspector_name,
            totalSpans: inspection.total_spans,
            conclusions: inspection.conclusions,
            overallBcicrit: inspection.overall_bcicrit,
            overallBciave: inspection.overall_bciave,

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
            }))
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

        const { elements, warning } = extractElements(text, elementRows.map(r => ({
            element_number: r.element_number,
            description: r.description
        })));

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

            // A brand-new defect (not saved yet) is identified by a temporary
            // composite key, not a real id — its photos can only be linked up
            // once the whole inspection is saved (see /save-inspection). An
            // existing defect already has a real numeric id, so its photos
            // can be persisted immediately instead of waiting.
            let realDefectId = null;
            if (defectId && /^\d+$/.test(defectId)) {
                const existing = await dbGet('SELECT id FROM defects WHERE id = $1', [defectId]);
                if (existing) realDefectId = existing.id;
            }

            const { structureId } = req.params;
            const inspectionDate = req.body.inspectionDate || new Date().toISOString().split('T')[0];

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
                    saved: !!realDefectId
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
             JOIN defects d ON dp.defect_id = d.id
             WHERE d.inspection_id = $1`,
            [inspection.id]
        );

        const signedPhotos = await Promise.all(photos.map(async photo => ({
            photo_id: photo.id,
            defect_id: photo.defect_id,
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
             WHERE d.inspection_id = $1`,
            [id]
        );

        await client.query(
            `DELETE FROM defect_photos WHERE defect_id IN (SELECT id FROM defects WHERE inspection_id = $1)`,
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

// Update an already-uploaded photo's description
app.patch('/api/inspection-photos/:photoId', requireAuth, async (req, res) => {
    try {
        const { photoId } = req.params;
        const { photo_description } = req.body;
        const result = await pool.query(
            'UPDATE defect_photos SET photo_description = $1 WHERE id = $2',
            [photo_description || '', photoId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, error: 'Photo not found' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Update photo description error:', err);
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

// LOGIN ENDPOINT
app.post('/api/login', async (req, res) => {
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
            'SELECT username, full_name, role, created_at, email, phone, last_login, totp_enabled, password_changed_at FROM users WHERE id = $1',
            [req.session.userId]
        );
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
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
            'SELECT username, full_name, role, created_at, email, phone, last_login, totp_enabled, password_changed_at FROM users WHERE id = $1',
            [req.session.userId]
        );
        res.json(user);
    } catch (err) {
        console.error('Update /api/me error:', err);
        res.status(500).json({ error: err.message });
    }
});

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

        const newHash = await bcrypt.hash(newPassword, 10);
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
                    created_at, conclusions, overall_bcicrit, overall_bciave,
                    (SELECT COUNT(*) FROM defects WHERE defects.inspection_id = inspections.id) AS defect_count
            FROM inspections
            ORDER BY inspection_date DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Critical bridges: lowest BCI per structure
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
            WHERE i.overall_bcicrit IS NOT NULL
              AND i.overall_bcicrit < 55
            ORDER BY i.overall_bcicrit ASC
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
                   inspector_name, conclusions, overall_bcicrit, overall_bciave, created_at
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
