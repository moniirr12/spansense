require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const bodyParser = require("body-parser");
const cors = require("cors");

const multer = require('multer');
const path = require('path');
const proj4 = require('proj4');

const router = express.Router();
const fs = require('fs');

const app = express();

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


app.get('/api/routes', (req, res) => {
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
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
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

        // Insert default admin user if table is empty
        const userCount = await dbGet("SELECT COUNT(*) as count FROM users");
        if (parseInt(userCount.count) === 0) {
            await pool.query(
                `INSERT INTO users (username, password, full_name, role) 
                 VALUES ($1, $2, $3, $4)`,
                ['admin', 'admin123', 'System Admin', 'admin']
            );
            console.log('Default user created: admin / admin123');
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

const session = require('express-session');

// Enable CORS for specific origins
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

// Handle preflight
app.options('*', cors());

// GET type distribution counts
app.get('/api/bridges/type-distribution', async (req, res) => {
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
app.get('/getBridgePhoto', async (req, res) => {
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
app.get('/api/inspection-dates/:structureId', async (req, res) => {
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
const SEEDED_ELEMENT_TYPES = ["Bridge", "Retaining wall"];
function resolveElementsType(requestedType) {
    return SEEDED_ELEMENT_TYPES.includes(requestedType) ? requestedType : "Bridge";
}

app.get("/get_elements", async (req, res) => {
    try {
        const structureType = resolveElementsType(req.query.type || "Bridge");
        const rows = await dbAll(
            "SELECT element_number, description FROM elements WHERE structure_type = $1 ORDER BY display_order ASC",
            [structureType]
        );
        res.json(rows.map(row => ({
            no: row.element_number,
            description: row.description,
            severity: "",
            extent: "",
            defect: ""
        })));
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Add to your Node.js server
app.get("/api/defects-by-date", async (req, res) => {
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

app.get('/get-spans', async (req, res) => {
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
app.get('/api/previousInspections', async (req, res) => {
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
app.get('/api/elements', async (req, res) => {
    try {
        const structureType = resolveElementsType(req.query.type || 'Bridge');
        const rows = await dbAll(
            'SELECT element_number, description FROM elements WHERE structure_type = $1 ORDER BY display_order ASC',
            [structureType]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error fetching elements:', err);
        res.status(500).json({ error: 'Failed to fetch elements' });
    }
});

// In your API route handler
app.get('/api/defectsbci', async (req, res) => {
    try {
        const { structureId, date } = req.query;

        const inspectionQuery = `
            SELECT id, inspection_date, inspector_name FROM inspections 
            WHERE structure_id = $1
            ${date ? 'AND inspection_date = $2' : ''}
        `;
        const inspectionParams = date ? [structureId, date] : [structureId];

        const inspections = await dbAll(inspectionQuery, inspectionParams);

        if (!inspections || inspections.length === 0) {
            return res.json([]);
        }

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
                i.inspector_name
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
                d.defect_number AS defN,
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
            return { ...span, defects: spanDefects };
        });

        res.json(result);
    } catch (error) {
        console.error('[API] Error in defectsbci endpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET ALL BRIDGES (with last inspection date)
app.get('/api/bridges', async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT b.id, b.name, b.location, b.latitude, b.longitude, b.span, b.length,
                    b.built_year, b.type, b.span_number, b.OSE, b.OSN,
                    b.primary_material, b.secondary_material, b.organization_id, b.bci_av,
                    MAX(i.inspection_date) as last_inspected
            FROM bridges b
            LEFT JOIN inspections i ON b.id = i.structure_id
            GROUP BY b.id, b.name, b.location, b.latitude, b.longitude, b.span, b.length,
                     b.built_year, b.type, b.span_number, b.OSE, b.OSN,
                     b.primary_material, b.secondary_material, b.organization_id, b.bci_av
            ORDER BY b.name
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get complete bridge data (PostgreSQL version)
app.get('/api/bridges/:id', async (req, res) => {
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

// Severity codes match the dropdown in inspection/inspectionA.js (1-5)
const SEVERITY_LABELS = { 1: 'Minor', 2: 'Moderate', 3: 'Severe', 4: 'Critical', 5: 'Emergency' };
const GI_CYCLE_YEARS = 2;
const PI_CYCLE_YEARS = 6;

// Aggregated data for the twinView 3D digital twin (twin/twin.html + twin.js).
// 3D geometry (deck width/truss height/panels per span) is NOT here - it's
// hand-authored per bridge id in twin/bridgeModels.js, not stored in the DB.
app.get('/api/twin/:structureId', async (req, res) => {
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
                `SELECT span_number, element_no, severity, works_required, pos_x, pos_y, pos_z
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
                    worksRequired: d.works_required === 'Y',
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

        const openDefects = defects.filter(d => d.worksRequired).length;

        // Next-due / overdue, following the 2yr GI / 6yr PI cycle used in planning.html
        function lastDateOf(type) {
            const matches = allInspections.filter(i => i.inspection_type === type);
            return matches.length ? new Date(matches[matches.length - 1].inspection_date) : null;
        }
        const lastGI = lastDateOf('GI');
        const lastPI = lastDateOf('PI');
        const dueDates = [];
        if (lastGI) dueDates.push({ type: 'GI', date: new Date(lastGI.getFullYear() + GI_CYCLE_YEARS, lastGI.getMonth(), lastGI.getDate()) });
        if (lastPI) dueDates.push({ type: 'PI', date: new Date(lastPI.getFullYear() + PI_CYCLE_YEARS, lastPI.getMonth(), lastPI.getDate()) });
        dueDates.sort((a, b) => a.date - b.date);
        const nextDue = dueDates[0] || null;
        const isOverdue = nextDue ? nextDue.date < new Date() : false;

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
            timestamp: new Date(i.inspection_date).getTime()
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
            bciCritLocation: critSpan ? `span ${critSpan.span_number}` : null,
            spanBCI,
            defects,
            inspections,
            timelineRange,
            lastInspection: lastInspectionLabel,
            nextInspection: nextInspectionLabel,
            isOverdue,
            openDefects,
            selectedInspectionId: selectedInspection ? selectedInspection.id : null,
            latestInspectionId: latestInspection ? latestInspection.id : null
        });
    } catch (err) {
        console.error('Twin data error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Configure multer storage for bridge-specific uploads
const photoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const structureId = req.params.structureId;
        const inspectionDate = req.body.inspectionDate || 
                             new Date().toISOString().split('T')[0];

        if (!structureId) {
            return cb(new Error('Bridge ID is required'), null);
        }

        const uploadDir = path.join(
            __dirname, 
            'uploads',
            `bridge_${structureId}`,
            'inspections',
            inspectionDate
        );

        fs.mkdir(uploadDir, { recursive: true }, (err) => {
            if (err) return cb(err);
            cb(null, uploadDir);
        });
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `photo_${uniqueSuffix}${ext}`);
    }
});

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

// Add this ABOVE your Multer configuration:
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Then your existing Multer config:
const upload = multer({
    storage: photoStorage,
    limits: {
        fileSize: 15 * 1024 * 1024,
        files: 20
    },
    fileFilter: fileFilter
});

// Get folders for a bridge
app.get('/api/bridges/:structureId/folders', async (req, res) => {
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
app.post('/api/bridges/:structureId/folders', async (req, res) => {
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
app.get('/api/bridges/:structureId/files', async (req, res) => {
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
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Upload file to a bridge
app.post('/api/bridges/:structureId/files',
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
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ error: 'Bridge not found' });
        }

        if (folderId) {
            const folderExists = await dbGet(
                'SELECT 1 FROM folders WHERE id = $1 AND bridge_id = $2',
                [folderId, structureId]
            );
            if (!folderExists) {
                fs.unlinkSync(req.file.path);
                return res.status(400).json({ error: 'Folder not found in this bridge' });
            }
        }

        const filePath = path.join('bridge_' + structureId, req.file.filename);

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
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: err.message });
    }
});

// Delete file endpoint - corrected version
app.delete('/api/bridges/:structureId/files/:fileId', async (req, res) => {
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

        const fullPath = path.join(__dirname, 'uploads', file.filepath);

        try {
            await fs.promises.unlink(fullPath);
        } catch (fsErr) {
            console.error('File system deletion error:', fsErr);
        }

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
app.delete('/api/bridges/:structureId/folders/:folderId', async (req, res) => {
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

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));



// Backend route for getting folder path
app.get('/api/bridges/:structureId/folders/:folderId/path', async (req, res) => {
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
app.get('/api/debug/count-test', async (req, res) => {
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
app.post('/save-inspection', async (req, res) => {
    const { inspection, defects, photoData = {} } = req.body;

    console.log('[1/6] Starting inspection save...');
    console.log('[DEBUG] Received photoData keys:', Object.keys(photoData));

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Compute overall BCI averages from spans
        const bciCrits = inspection.spans.map(s => parseFloat(s.bciCrit) || 100);
        const bciAvs   = inspection.spans.map(s => parseFloat(s.bciAv)   || 100);
        const overallBciCrit = parseFloat((bciCrits.reduce((a, b) => a + b, 0) / bciCrits.length).toFixed(2));
        const overallBciAve  = parseFloat((bciAvs.reduce((a, b) => a + b, 0) / bciAvs.length).toFixed(2));
        console.log(`[INFO] Overall BCI - Crit: ${overallBciCrit}, Ave: ${overallBciAve}`);

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
        console.log(`[SUCCESS] Inserted inspection ID: ${inspectionId}`);
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
            console.log(`[4/6] Processing ${defects.length} defects...`);
            const defectCounts = {};

            for (const defect of defects) {
                const key = `${defect.spanNumber}-${defect.elementNumber}`;
                defectCounts[key] = (defectCounts[key] || 0) + 1;

                const defectCombined = `${defect.defectType}.${defect.defectNumber}`;
                const tempDefectKey = `${inspection.structure_id}_${inspection.inspection_date}_${defect.spanNumber}_${defect.elementNumber}_${defectCombined}`;

                console.log(`[DEBUG] Generated temp key for defect: ${tempDefectKey}`);

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
                        defect.priority?.charAt(0) || 'M',
                        parseFloat(defect.cost) || 0,
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
                console.log(`[SUCCESS] Inserted defect ID: ${defectId} (TempKey: ${tempDefectKey})`);
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
            console.log('[5/6] Processing photo data...');
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
            console.log(`[INFO] Inserted ${totalPhotos} photos`);
        }

        await client.query('COMMIT');
        console.log('[SUCCESS] Transaction completed successfully');

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
app.put('/update-inspection', async (req, res) => {
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

        // Compute overall BCI averages from spans
        const bciCrits = inspection.spans.map(s => parseFloat(s.bciCrit) || 100);
        const bciAvs   = inspection.spans.map(s => parseFloat(s.bciAv)   || 100);
        const overallBciCrit = parseFloat((bciCrits.reduce((a, b) => a + b, 0) / bciCrits.length).toFixed(2));
        const overallBciAve  = parseFloat((bciAvs.reduce((a, b) => a + b, 0) / bciAvs.length).toFixed(2));
        console.log(`[INFO] Update - Overall BCI - Crit: ${overallBciCrit}, Ave: ${overallBciAve}`);

        // 2. Update inspection with overall BCI
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

            await client.query(
                `INSERT INTO defects (
                    inspection_id, span_number, element_no, defect_no,
                    defect_type, defect_number, severity,
                    extent, works_required, priority,
                    cost, comments, remedial_works, timestamp,
                    pos_x, pos_y, pos_z, is_primary
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
                [
                    inspectionId,
                    defect.spanNumber,
                    defect.elementNumber,
                    defectCounts[key],
                    defect.defectType,
                    defect.defectNumber || '1',
                    defect.severity,
                    defect.extent,
                    defect.worksRequired || '',
                    defect.priority || 'M',
                    defect.cost || 0,
                    defect.comments || '',
                    defect.remedial_works || '',
                    defect.timestamp || new Date().toISOString(),
                    defect.posX ?? null,
                    defect.posY ?? null,
                    defect.posZ ?? null,
                    defect.isPrimary === true
                ]
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
app.post('/find-inspection-id', async (req, res) => {
    try {
        const { structure_id, inspection_date } = req.body;
        const row = await dbGet(
            `SELECT id FROM inspections 
             WHERE structure_id = $1 AND inspection_date = $2`,
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
app.get('/api/inspection/full', async (req, res) => {
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
                defect_id,
                photo_url,
                photo_description,
                display_order,
                front_defectid
            FROM defect_photos
            WHERE defect_id IN (SELECT id FROM defects WHERE inspection_id = $1)
            ORDER BY defect_id, display_order
        `, [inspection.id]);

        // Group photos by defect_id
        const photosByDefect = defectPhotos.reduce((acc, photo) => {
            if (!acc[photo.defect_id]) {
                acc[photo.defect_id] = [];
            }
            acc[photo.defect_id].push({
                url: photo.photo_url,
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

// GET /api/worksrequired
app.get('/api/worksrequired', async (req, res) => {
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
                cost: item.cost ? `£${item.cost.toFixed(2)}` : 'Not specified'
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

// Configure photo storage
const inspectionPhotoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const { structureId } = req.params;
        const inspectionDate = req.body.inspectionDate || new Date().toISOString().split('T')[0];
        const uploadDir = path.join(__dirname, 'uploads', `bridge_${structureId}`, 'inspections', inspectionDate);

        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const uploadInspectionPhotos = multer({
    storage: inspectionPhotoStorage,
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
app.post('/api/bridges/:structureId/inspection-photos',
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

            const descriptions = req.body.descriptions || [];
            const displayOrders = req.body.displayOrders || [];
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

            const uploadedFiles = [];
            for (let index = 0; index < req.files.length; index++) {
                const file = req.files[index];
                const url = `/uploads/${path.relative(path.join(__dirname, 'uploads'), file.path).split(path.sep).join('/')}`;
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
                    filename: file.filename,
                    path: file.path,
                    size: file.size,
                    mimetype: file.mimetype,
                    url,
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
app.get('/api/bridges/:structureId/inspection-photos', async (req, res) => {
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

        res.json({
            success: true,
            photos: photos.map(photo => ({
                photo_id: photo.id,
                defect_id: photo.defect_id,
                front_defectid: photo.front_defectid,
                photo_url: photo.photo_url,
                photo_description: photo.photo_description,
                display_order: photo.display_order,
                file_name: photo.file_name,
                file_size: photo.file_size,
                file_type: photo.file_type,
                uploaded_at: photo.uploaded_at
            }))
        });
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({
            success: false,
            error: 'Database error'
        });
    }
});

// Delete a single already-uploaded inspection photo (DB row + file on disk)
app.delete('/api/inspection-photos/:photoId', async (req, res) => {
    try {
        const { photoId } = req.params;
        const photo = await dbGet('SELECT photo_url FROM defect_photos WHERE id = $1', [photoId]);
        if (!photo) {
            return res.status(404).json({ success: false, error: 'Photo not found' });
        }

        await pool.query('DELETE FROM defect_photos WHERE id = $1', [photoId]);

        const filePath = path.join(__dirname, photo.photo_url.replace(/^\//, ''));
        fs.unlink(filePath, (err) => {
            if (err) console.warn('Could not delete photo file:', filePath, err.message);
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Delete photo error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update an already-uploaded photo's description
app.patch('/api/inspection-photos/:photoId', async (req, res) => {
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

// ADD SESSION MIDDLEWARE
app.use(session({
    secret: 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: false,
        sameSite: 'lax'
    }
}));

// AUTHENTICATION MIDDLEWARE
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized - Please log in' });
    }
}

// LOGIN ENDPOINT
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        console.log('Login attempt:', username);

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
            console.log('User not found:', username);
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid username or password' 
            });
        }

        if (password === user.password) {
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.organizationId = user.organization_id;
            req.session.role = user.role;

            console.log('Login successful for:', username);

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
            console.log('Invalid password for:', username);
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

// 2. BCI Distribution - Simplified
app.get('/api/bci-distribution', async (req, res) => {
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
app.get('/api/condition-distribution', async (req, res) => {
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

        console.log('Condition distribution data:', rows);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Condition distribution error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET ALL INSPECTIONS (list for export page)
app.get('/api/inspections', async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT id, structure_id, structure_name, inspection_date, 
                    inspection_type, inspector_name, total_spans, 
                    created_at, conclusions, overall_bcicrit, overall_bciave
            FROM inspections 
            ORDER BY inspection_date DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Critical bridges: lowest BCI per structure
app.get('/api/dashboard/critical-bridges', async (req, res) => {
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
              AND i.overall_bciave < 55
            ORDER BY i.overall_bciave ASC
            LIMIT 10
        `);

        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Critical bridges error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Average BCI per structure type, using each structure's latest inspection
app.get('/api/dashboard/avg-bci-by-type', async (req, res) => {
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
app.get('/api/dashboard/recent-activity', async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT
                structure_id,
                structure_name,
                inspector_name,
                created_at,
                overall_bciave,
                overall_bcicrit
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

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
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
