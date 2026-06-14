const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const cors = require("cors");

const multer = require('multer'); // Ensure this line is present
const path = require('path');

const router = express.Router();
const fs = require('fs');

const app = express();
const db = new sqlite3.Database("./bridges.db");

const session = require('express-session'); // for authentication sessions


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
app.get('/api/bridges/type-distribution', (req, res) => {
  const query = `
    SELECT type, COUNT(*) as count 
    FROM bridges 
    GROUP BY type
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ 
        success: false,
        error: err.message 
      });
    }
    
    res.json({ 
      success: true,
      data: rows
    });
  });
});

// Endpoint to fetch the photo URL for a bridge
app.get('/getBridgePhoto', (req, res) => {
    const bridgeId = req.query.bridgeId;

    // Query the database for the bridge's photo URL
    const query = "SELECT photo_url FROM bridges WHERE id = ?";
    db.get(query, [bridgeId], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!row) {
            return res.status(404).json({ error: 'Bridge not found' });
        }
        res.json({ photo_url: row.photo_url });
    });
});


// Get unique inspection dates (and type) for a bridge
app.get('/api/inspection-dates/:structureId', (req, res) => {
    const { structureId } = req.params;
    
    const query = `
        SELECT DISTINCT 
            inspection_date as date, 
            COALESCE(inspection_type, 'Inspection') as type 
        FROM inspections 
        WHERE structure_id = ? 
        ORDER BY inspection_date DESC
    `;
    
    db.all(query, [structureId], (err, results) => {
        if (err) {
            console.error('Error fetching inspection dates:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Get elements of the table in inspection.html
app.get("/get_elements", (req, res) => {
    db.all("SELECT element_number, description FROM elements ORDER BY element_number ASC", [], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json(rows.map(row => ({
            no: row.element_number,  // ✅ Ensures correct order
            description: row.description,
            severity: "",
            extent: "",
            defect: ""
        })));
    });
});

// Add to your Node.js server
app.get("/api/defects-by-date", (req, res) => {
    const { structure_number, date } = req.query;
    
    db.all(`
        SELECT 
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
        WHERE i.structure_id = ? 
        AND i.inspection_date = ?
        ORDER BY d.span_number, d.element_no, d.defect_no
    `, [structure_number, date], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Transform the data to match your frontend expectations
        const transformed = rows.map(row => ({
            span_number: row.span_number,
            element_no: row.element_no,
            def: `${row.defect_type}.${row.defect_number}`,
            s: row.severity,
            ex: row.extent,
            w: row.works_required ? 'Yes' : 'No',
            remedial_works: row.remedial_works || '',  // ADD THIS FIELD
            p: row.priority,
            cost: row.cost,
            comments_remarks: row.comments,
            bci_crit: row.bci_crit,
            bci_av: row.bci_av,
            timestamp: row.timestamp
        }));
        
        res.json(transformed);
    });
});


app.get('/get-spans', (req, res) => {
    const bridgeId = parseInt(req.query.bridgeId, 10);

    if (isNaN(bridgeId)) {
        return res.status(400).json({ error: 'Invalid Bridge ID' });
    }

    const query = 'SELECT span_number FROM bridges WHERE id = ?';
    db.get(query, [bridgeId], (err, row) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!row) {
            return res.status(404).json({ error: 'Bridge not found' });
        }

        // Return the span_number
        res.json({ span_number: row.span_number });
    });
});



// Endpoint to fetch previous inspections for a specific structure
app.get('/api/previousInspections', (req, res) => {
    const { structureId } = req.query;

    if (!structureId) {
        return res.status(400).json({
            success: false,
            message: 'structureId is required',
        });
    }

    const query = `
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
            GROUP_CONCAT(DISTINCT sp.bci_crit) AS bci_crit_values,
            GROUP_CONCAT(DISTINCT sp.bci_av) AS bci_av_values
        FROM inspections i
        LEFT JOIN inspection_spans sp ON i.id = sp.inspection_id
        WHERE i.structure_id = ?
        GROUP BY i.id
        ORDER BY i.inspection_date DESC;
    `;

    db.all(query, [structureId], (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({
                success: false,
                error: 'Database error',
            });
        }

        // Format the data
        const documents = rows.map(row => {
            // Convert comma-separated values to arrays of numbers
            const critValues = row.bci_crit_values 
                ? row.bci_crit_values.split(',').map(Number) 
                : [];
            const avValues = row.bci_av_values 
                ? row.bci_av_values.split(',').map(Number) 
                : [];

            // Calculate averages (or use other aggregation as needed)
            const bci_crit = critValues.length > 0 
                ? Math.max(...critValues) // Or average: critValues.reduce((a,b)=>a+b,0)/critValues.length
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
                bci_crit: row.overall_bcicrit || bci_crit,  // Prefer stored overall, fallback to computed
                bci_av: row.overall_bciave || bci_av,        // Prefer stored overall, fallback to computed
                overall_bcicrit: row.overall_bcicrit,
                overall_bciave: row.overall_bciave
            };
        });

        res.json({
            success: true,
            documents,
        });
    });
});// API endpoint to fetch elements
app.get('/api/elements', (req, res) => {
    const query = 'SELECT element_number, description FROM elements'; // Adjust query as needed
  
    // Use db.all to fetch all rows
    db.all(query, (err, rows) => {
      if (err) {
        console.error('Error fetching elements:', err);
        return res.status(500).json({ error: 'Failed to fetch elements' });
      }
      res.json(rows); // Return the fetched data
    });
});



// In your API route handler
app.get('/api/defectsbci', async (req, res) => {
    const { structureId, date } = req.query;
    // console.log(`[API] Received request for defects - structureId: ${structureId}, date: ${date}`);
    
    try {
        // First get the inspection ID(s)
        const inspectionQuery = `
            SELECT id, inspection_date, inspector_name FROM inspections 
            WHERE structure_id = ?
            ${date ? 'AND inspection_date = ?' : ''}
        `;
        const inspectionParams = date ? [structureId, date] : [structureId];
        
        // console.log(`[API] Executing inspection query: ${inspectionQuery} with params: ${JSON.stringify(inspectionParams)}`);
        
        db.all(inspectionQuery, inspectionParams, async (err, inspections) => {
            if (err) {
                console.error('[API] Error fetching inspections:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            // console.log(`[API] Found ${inspections.length} inspections`);
            
            if (!inspections || inspections.length === 0) {
                console.log('[API] No inspections found, returning empty array');
                return res.json([]);
            }
            
            // Get all spans and defects for these inspections
            const inspectionIds = inspections.map(i => i.id);
            const placeholders = inspectionIds.map(() => '?').join(',');
            
            // Get spans with BCI data
            const spansQuery = `
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
            `;
            
            // console.log(`[API] Executing spans query: ${spansQuery} with inspectionIds: ${inspectionIds.join(',')}`);
            
            db.all(spansQuery, inspectionIds, (spanErr, spans) => {
                if (spanErr) {
                    console.error('[API] Error fetching spans:', spanErr);
                    return res.status(500).json({ error: 'Database error' });
                }
                
                // console.log(`[API] Found ${spans.length} spans`);
                
                // Get defects
                const defectsQuery = `
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
                        i.inspection_date
                    FROM defects d
                    JOIN inspections i ON d.inspection_id = i.id
                    WHERE d.inspection_id IN (${placeholders})
                `;
                
                // console.log(`[API] Executing defects query: ${defectsQuery} with inspectionIds: ${inspectionIds.join(',')}`);
                
                db.all(defectsQuery, inspectionIds, (defectErr, defects) => {
                    if (defectErr) {
                        console.error('[API] Error fetching defects:', defectErr);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    
                    // console.log(`[API] Found ${defects.length} defects`);
                    if (defects.length > 0) {
                        // console.log('[API] First defect sample:', JSON.stringify(defects[0]));
                    }
                    
                    // Combine the data in a format the frontend expects
                    const result = spans.map(span => {
                        const spanDefects = defects.filter(d => 
                            d.inspection_id === span.inspection_id && 
                            d.span_number === span.span_number
                        );
                        
                        // console.log(`[API] Span ${span.span_number} has ${spanDefects.length} defects`);
                        
                        return {
                            ...span,
                            defects: spanDefects
                        };
                    });
                    
                    // console.log('[API] Final response data sample:', JSON.stringify(result[0]));
                    res.json(result);
                });
            });
        });
    } catch (error) {
        console.error('[API] Error in defectsbci endpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});



// Get complete bridge data (SQLite version)
app.get('/api/bridges/:id', async (req, res) => {
  try {
    const row = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM bridges WHERE id = ?',
        [req.params.id],
        (err, row) => err ? reject(err) : resolve(row)
      );
    });
    
    if (!row) {
      return res.status(404).json({ error: 'Bridge not found' });
    }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});


// Configure multer storage for bridge-specific uploads
const photoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const structureId = req.params.structureId;
        const inspectionDate = req.body.inspectionDate || 
                             new Date().toISOString().split('T')[0]; // Default to today
        
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
        fileSize: 50 * 1024 * 1024, // 50MB
        files: 20 // Maximum number of files
    },
    fileFilter: fileFilter
});

// Database helper functions
function dbGet(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function dbAll(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function dbRun(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

// Get folders for a bridge
app.get('/api/bridges/:structureId/folders', async (req, res) => {
    try {
        const { structureId } = req.params;
        const { parentId } = req.query;
        
        let query = 'SELECT * FROM folders WHERE bridge_id = ?';
        const params = [structureId];
        
        if (parentId) {
            query += ' AND parent_id = ?';
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
        
        // Validate bridge exists
        const bridgeExists = await dbGet('SELECT 1 FROM bridges WHERE id = ?', [structureId]);
        if (!bridgeExists) {
            return res.status(404).json({ error: 'Bridge not found' });
        }
        
        // Validate parent folder if specified
        if (parent_id) {
            const parentExists = await dbGet(
                'SELECT 1 FROM folders WHERE id = ? AND bridge_id = ?', 
                [parent_id, structureId]
            );
            if (!parentExists) {
                return res.status(400).json({ error: 'Parent folder not found in this bridge' });
            }
        }
        
        // Create folder
        const result = await dbRun(
            'INSERT INTO folders (name, parent_id, bridge_id) VALUES (?, ?, ?)',
            [name, parent_id || null, structureId]
        );
        
        res.status(201).json({
            id: result.lastID,
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
        
        let query = 'SELECT * FROM files WHERE bridge_id = ?';
        const params = [structureId];
        
        if (folderId) {
            query += ' AND folder_id = ?';
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
app.post('/api/bridges/:structureId/files', upload.single('file'), async (req, res) => {
    try {
        const { structureId } = req.params;
        const { folderId } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        // Validate bridge exists
        const bridgeExists = await dbGet('SELECT 1 FROM bridges WHERE id = ?', [structureId]);
        if (!bridgeExists) {
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ error: 'Bridge not found' });
        }
        
        // Validate folder if specified
        if (folderId) {
            const folderExists = await dbGet(
                'SELECT 1 FROM folders WHERE id = ? AND bridge_id = ?',
                [folderId, structureId]
            );
            if (!folderExists) {
                fs.unlinkSync(req.file.path);
                return res.status(400).json({ error: 'Folder not found in this bridge' });
            }
        }
        
        const filePath = path.join('bridge_' + structureId, req.file.filename);
        
        // Save to database (using filepath as column name)
        const result = await dbRun(
            `INSERT INTO files (name, filepath, size, mime_type, folder_id, bridge_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
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
            id: result.lastID,
            name: req.file.originalname,
            filepath: filePath,  // Changed from 'path' to 'filepath' to match DB column
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
        
        // Validate inputs
        if (!structureId || !fileId) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        // Get file info - using correct column name
        const file = await dbGet(
            'SELECT filepath FROM files WHERE id = ? AND bridge_id = ?',
            [fileId, structureId]
        );
        
        if (!file || !file.filepath) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Delete from database first
        const result = await dbRun(
            'DELETE FROM files WHERE id = ? AND bridge_id = ?',
            [fileId, structureId]
        );
        
        if (result.changes === 0) {
            return res.status(404).json({ error: 'File not found in database' });
        }
        
        // Delete from filesystem - with proper error handling
        const fullPath = path.join(__dirname, 'uploads', file.filepath);
        
        try {
            await fs.promises.unlink(fullPath);
        } catch (fsErr) {
            console.error('File system deletion error:', fsErr);
            // Continue even if file deletion fails
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
        
        // Validate inputs
        if (!structureId || !folderId) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        // Verify folder exists
        const folder = await dbGet(
            'SELECT id FROM folders WHERE id = ? AND bridge_id = ?', 
            [folderId, structureId]
        );
        
        if (!folder) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        // Perform deletion
        const result = await dbRun(
            'DELETE FROM folders WHERE id = ? AND bridge_id = ?',
            [folderId, structureId]
        );
        
        if (result.changes === 0) {
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

// Error handler
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message });
});


// Backend route for getting folder path
app.get('/api/bridges/:structureId/folders/:folderId/path', async (req, res) => {
    try {
        const { structureId, folderId } = req.params;
        
        // Recursive query matching your exact schema
        const path = await dbAll(`
            WITH RECURSIVE folder_path(id, name, parent_id, bridge_id, created_at) AS (
                SELECT id, name, parent_id, bridge_id, created_at 
                FROM folders 
                WHERE id = ? AND bridge_id = ?
                
                UNION ALL
                
                SELECT f.id, f.name, f.parent_id, f.bridge_id, f.created_at
                FROM folders f
                JOIN folder_path fp ON f.id = fp.parent_id
                WHERE f.bridge_id = ? AND fp.parent_id IS NOT NULL
            )
            SELECT id, name, parent_id FROM folder_path
            ORDER BY created_at ASC  -- Oldest first (root to current)
        `, [folderId, structureId, structureId]);
        
        res.json(path);
    } catch (err) {
        console.error('Error fetching folder path:', err);
        res.status(500).json({ error: 'Failed to fetch folder path' });
    }
});

// In your routes/debug.js or wherever this route lives
app.get('/api/debug/count-test', (req, res) => {
db.get("SELECT COUNT(*) as count FROM bridges", (err, row) => {
    if (err) {
    console.error('Database error:', err);
    return res.status(500).json({ 
        success: false,
        error: err.message 
    });
    }
    res.json({ 
    success: true,
    bridge_count: row.count,  // Changed to match frontend expectation
    server: "debug-server"    // Optional extra field
    });
});
});





// SAVE INSPECTION DATA TO DATABASE
app.post('/save-inspection', (req, res) => {
  const { inspection, defects, photoData = {} } = req.body;

  console.log('[1/6] Starting inspection save...');
  console.log('[DEBUG] Received photoData keys:', Object.keys(photoData));

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    // Compute overall BCI averages from spans
    const bciCrits = inspection.spans.map(s => parseFloat(s.bciCrit) || 100);
    const bciAvs   = inspection.spans.map(s => parseFloat(s.bciAv)   || 100);
    const overallBciCrit = parseFloat((bciCrits.reduce((a, b) => a + b, 0) / bciCrits.length).toFixed(2));
    const overallBciAve  = parseFloat((bciAvs.reduce((a, b) => a + b, 0) / bciAvs.length).toFixed(2));
    console.log(`[INFO] Overall BCI - Crit: ${overallBciCrit}, Ave: ${overallBciAve}`);

    // 1. Insert inspection with overall BCI
    db.run(
      `INSERT INTO inspections (
        structure_id, structure_name, inspection_date, 
        inspection_type, inspector_name, total_spans, conclusions,
        overall_bcicrit, overall_bciave
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ],
      function(err) {
        if (err) {
          console.error('[ERROR] Inspection insert failed:', err);
          db.run("ROLLBACK");
          return res.status(500).json({ success: false, message: err.message });
        }

        const inspectionId = this.lastID;
        console.log(`[SUCCESS] Inserted inspection ID: ${inspectionId}`);
        const insertedDefects = [];
        let defectsProcessed = 0;
        let hasDefectError = false;

        // 2. Insert spans
        const spanInsert = db.prepare(
          `INSERT INTO inspection_spans (
            inspection_id, span_number, elements_inspected,
            photographs_taken, comments, bci_crit, bci_av
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        );

        inspection.spans.forEach(span => {
          spanInsert.run(
            inspectionId,
            span.spanNumber,
            span.elementsInspected ? 1 : 0,
            span.photographsTaken ? 1 : 0,
            span.comments || '',
            span.bciCrit || null,
            span.bciAv || null
          );
        });

        spanInsert.finalize();

        // 3. Insert defects with proper async handling
        if (defects.length === 0) {
          console.log('[INFO] No defects to process');
          db.run("COMMIT", (err) => {
            if (err) {
              console.error('[ERROR] Commit failed:', err);
              return res.status(500).json({ success: false, message: err.message });
            }
            console.log('[SUCCESS] Transaction committed without defects');
            return res.json({ 
              success: true, 
              inspectionId,
              message: 'Inspection saved with no defects' 
            });
          });
          return;
        }

        console.log(`[4/6] Processing ${defects.length} defects...`);
        const defectInsert = db.prepare(
          `INSERT INTO defects (
            inspection_id, span_number, element_no,
            defect_no, defect_type, defect_number,
            severity, extent, works_required,
            priority, cost, comments, remedial_works, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );

        const defectCounts = {};

        defects.forEach(defect => {
          const key = `${defect.spanNumber}-${defect.elementNumber}`;
          defectCounts[key] = (defectCounts[key] || 0) + 1;

          const defectCombined = `${defect.defectType}.${defect.defectNumber}`;

          // Generate the temporary key that matches photoData keys
          const tempDefectKey = `${inspection.structure_id}_${inspection.inspection_date}_${defect.spanNumber}_${defect.elementNumber}_${defectCombined}`;
          console.log(`[DEBUG] Generated temp key for defect: ${tempDefectKey}`);
          console.log(`[DEBUG] Defect comments being saved: "${defect.comments || ''}"`);
          console.log(`[DEBUG] Defect remedial_works being saved: "${defect.remedial_works || ''}"`);

          defectInsert.run(
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
            defect.comments || '',           // ← Using 'comments' (plural)
            defect.remedial_works || '',     // ← Using 'remedial_works' (underscore)
            defect.timestamp || new Date().toISOString(),
            function(err) {
              defectsProcessed++;

              if (err) {
                console.error('[ERROR] Defect insert failed:', err);
                hasDefectError = true;
              } else {
                const defectId = this.lastID;
                console.log(`[SUCCESS] Inserted defect ID: ${defectId} (TempKey: ${tempDefectKey})`);
                insertedDefects.push({
                  defectId: defectId,
                  tempDefectKey: tempDefectKey,
                  spanNumber: defect.spanNumber,
                  elementNumber: defect.elementNumber,
                  defectNo: defectCounts[key]
                });
              }

              // When all defects are processed
              if (defectsProcessed === defects.length) {
                if (hasDefectError) {
                  console.error('[ERROR] Rolling back due to defect errors');
                  db.run("ROLLBACK");
                  return res.status(500).json({ 
                    success: false, 
                    message: "Defect insertion failed",
                    details: `${defectsProcessed - insertedDefects.length} defects failed to save`
                  });
                }

                console.log('[5/6] Processing photo data...');
                // 4. Insert actual photos from photoData
                if (Object.keys(photoData).length === 0) {
                  console.log('[INFO] No photoData provided');
                  db.run("COMMIT", (err) => {
                    if (err) {
                      console.error('[ERROR] Commit failed:', err);
                      return res.status(500).json({ 
                        success: false, 
                        message: 'Transaction commit failed',
                        error: err.message 
                      });
                    }
                    console.log('[SUCCESS] Transaction committed without photos');
                    return res.json({ 
                      success: true, 
                      inspectionId,
                      message: 'Inspection saved with no photos' 
                    });
                  });
                  return;
                }

                const photoInsert = db.prepare(
                  `INSERT INTO defect_photos (
                    defect_id, photo_url, photo_description, display_order, front_defectid
                  ) VALUES (?, ?, ?, ?, ?)`
                );

                let photosProcessed = 0;
                let hasPhotoError = false;
                let totalPhotos = 0;

                // Count and verify photos
                insertedDefects.forEach(defect => {
                  if (photoData[defect.tempDefectKey]) {
                    totalPhotos += photoData[defect.tempDefectKey].length;
                    console.log(`[DEBUG] Found ${photoData[defect.tempDefectKey].length} photos for ${defect.tempDefectKey}`);
                  } else {
                    console.log(`[WARNING] No photos found for ${defect.tempDefectKey}`);
                  }
                });

                if (totalPhotos === 0) {
                  console.log('[INFO] No photos matched to defects');
                  db.run("COMMIT", (err) => {
                    if (err) {
                      console.error('[ERROR] Commit failed:', err);
                      return res.status(500).json({ 
                        success: false, 
                        message: 'Transaction commit failed',
                        error: err.message 
                      });
                    }
                    console.log('[SUCCESS] Transaction committed without photos');
                    return res.json({ 
                      success: true, 
                      inspectionId,
                      message: 'Inspection saved with no matched photos' 
                    });
                  });
                  return;
                }

                console.log(`[INFO] Preparing to insert ${totalPhotos} photos...`);

                // Insert photos
                insertedDefects.forEach(defect => {
                  if (photoData[defect.tempDefectKey]) {
                    photoData[defect.tempDefectKey].forEach((photo, index) => {
                      console.log(`[DEBUG] Inserting photo for defect ${defect.defectId}:`, {
                        url: photo.photo_url,
                        desc: photo.photo_description,
                        order: photo.display_order || index
                      });

                      photoInsert.run(
                        defect.defectId,
                        photo.photo_url,
                        photo.photo_description,
                        photo.display_order || index,
                        defect.tempDefectKey,
                        function(err) {
                          photosProcessed++;

                          if (err) {
                            console.error(`[ERROR] Photo insert failed for defect ${defect.defectId}:`, err);
                            hasPhotoError = true;
                          } else {
                            console.log(`[SUCCESS] Inserted photo for defect ${defect.defectId}`);
                          }

                          // When all photos are processed
                          if (photosProcessed === totalPhotos) {
                            photoInsert.finalize(err => {
                              if (err || hasPhotoError) {
                                console.error('[ERROR] Photo finalization failed:', err || 'Photo errors occurred');
                                db.run("ROLLBACK");
                                return res.status(500).json({ 
                                  success: false, 
                                  message: "Photo insertion failed",
                                  details: `${photosProcessed - (totalPhotos - (err ? 1 : 0))} photos failed to save`
                                });
                              }

                              console.log('[6/6] Finalizing transaction...');
                              db.run("COMMIT", (err) => {
                                if (err) {
                                  console.error('[ERROR] Final commit failed:', err);
                                  return res.status(500).json({ 
                                    success: false, 
                                    message: 'Final commit failed',
                                    error: err.message 
                                  });
                                }
                                console.log('[SUCCESS] Transaction completed successfully');
                                res.json({ 
                                  success: true, 
                                  inspectionId,
                                  defectCount: insertedDefects.length,
                                  photoCount: totalPhotos,
                                  message: 'Inspection saved with photos'
                                });
                              });
                            });
                          }
                        }
                      );
                    });
                  }
                });
              }
            }
          );
        });

        defectInsert.finalize(err => {
          if (err) console.error('[WARNING] Defect finalize warning:', err);
        });
      }
    );
  });
});// UPDATE INSPECTION ENDPOINT
app.put('/update-inspection', async (req, res) => {
  const { inspection, defects, inspectionId } = req.body;

  try {
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        // 1. Verify inspection exists
        db.get(`SELECT id FROM inspections WHERE id = ?`, [inspectionId], (err, row) => {
          if (err || !row) {
            db.run("ROLLBACK");
            return reject(err || new Error("Inspection not found"));
          }

          // Compute overall BCI averages from spans
          const bciCrits = inspection.spans.map(s => parseFloat(s.bciCrit) || 100);
          const bciAvs   = inspection.spans.map(s => parseFloat(s.bciAv)   || 100);
          const overallBciCrit = parseFloat((bciCrits.reduce((a, b) => a + b, 0) / bciCrits.length).toFixed(2));
          const overallBciAve  = parseFloat((bciAvs.reduce((a, b) => a + b, 0) / bciAvs.length).toFixed(2));
          console.log(`[INFO] Update - Overall BCI - Crit: ${overallBciCrit}, Ave: ${overallBciAve}`);

          // 2. Update inspection with overall BCI
          db.run(
            `UPDATE inspections SET
              structure_id = ?,
              structure_name = ?,
              inspection_date = ?,
              inspection_type = ?,
              inspector_name = ?,
              total_spans = ?,
              conclusions = ?,
              overall_bcicrit = ?,
              overall_bciave = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
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
            ],
            function(err) {
              if (err) {
                db.run("ROLLBACK");
                return reject(err);
              }

              // 3. Delete existing spans and defects
              db.run(`DELETE FROM defects WHERE inspection_id = ?`, [inspectionId]);
              db.run(`DELETE FROM inspection_spans WHERE inspection_id = ?`, [inspectionId], (err) => {
                if (err) {
                  db.run("ROLLBACK");
                  return reject(err);
                }

                // 4. Insert new spans
                const spanInsert = db.prepare(
                  `INSERT INTO inspection_spans (
                    inspection_id, span_number, elements_inspected,
                    photographs_taken, comments, bci_crit, bci_av
                  ) VALUES (?, ?, ?, ?, ?, ?, ?)`
                );

                // Create set of valid span numbers
                const validSpans = new Set();
                inspection.spans.forEach(span => {
                  validSpans.add(span.spanNumber);
                  spanInsert.run(
                    inspectionId,
                    span.spanNumber,
                    span.elementsInspected ? 1 : 0,
                    span.photographsTaken ? 1 : 0,
                    span.comments || '',
                    span.bciCrit || null,
                    span.bciAv || null
                  );
                });

                spanInsert.finalize(err => {
                  if (err) {
                    db.run("ROLLBACK");
                    return reject(err);
                  }

                  // 5. Validate defects before insertion
                  const invalidDefects = defects.filter(d => {
                    const spanExists = validSpans.has(d.spanNumber);
                    if (!spanExists) {
                      console.error(`Defect references invalid span ${d.spanNumber} (element ${d.elementNumber})`);
                    }
                    return !spanExists;
                  });

                  if (invalidDefects.length > 0) {
                    db.run("ROLLBACK");
                    const errorDetails = invalidDefects.map(d => 
                      `Span ${d.spanNumber}, Element ${d.elementNumber}`
                    ).join('; ');
                    return reject(new Error(
                      `Some defects reference spans that don't exist in this inspection. ` +
                      `Problematic entries: ${errorDetails}. ` +
                      `Valid spans are: ${Array.from(validSpans).join(', ')}`
                    ));
                  }

                  // 6. Insert validated defects with consistent field names
                  const defectInsert = db.prepare(
                    `INSERT INTO defects (
                      inspection_id, span_number, element_no, defect_no,
                      defect_type, defect_number, severity,
                      extent, works_required, priority,
                      cost, comments, remedial_works, timestamp
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                  );

                  console.log("Inserting defects with comments:", defects.map(d => ({ 
                    comments: d.comments, 
                    remedial_works: d.remedial_works 
                  })));

                  const defectCounts = {};
                  defects.forEach(defect => {
                    const key = `${defect.spanNumber}-${defect.elementNumber}`;
                    defectCounts[key] = (defectCounts[key] || 0) + 1;

                    defectInsert.run(
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
                      defect.comments || '',        // ← Using 'comments' (plural)
                      defect.remedial_works || '',  // ← Using 'remedial_works' (underscore)
                      defect.timestamp || new Date().toISOString()
                    );
                  });

                  defectInsert.finalize(err => {
                    if (err) {
                      db.run("ROLLBACK");
                      return reject(err);
                    }

                    db.run("COMMIT", (err) => {
                      if (err) return reject(err);
                      resolve({ success: true, inspectionId });
                    });
                  });
                });
              });
            }
          );
        });
      });
    });

    res.json({ success: true, inspectionId });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message
    });
  }
});// New endpoint to find inspectionId by structure_id and inspection_date
app.post('/find-inspection-id', (req, res) => {
  const { structure_id, inspection_date } = req.body;
  
  db.get(
    `SELECT id FROM inspections 
     WHERE structure_id = ? AND inspection_date = ?`,
    [structure_id, inspection_date],
    (err, row) => {
      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }
      if (!row) {
        return res.status(404).json({ success: false, message: "Inspection not found" });
      }
      res.json({ success: true, inspectionId: row.id });
    }
  );
});



//EDIT BUTTON INSPECTION RETRIEVAL
// Endpoint to fetch full inspection data WITH defects and their photos
app.get('/api/inspection/full', async (req, res) => {
  const { structure_id, date } = req.query;

  try {
    // 1. Get inspection metadata
    const inspection = await new Promise((resolve, reject) => {
      db.get(`
        SELECT id, structure_id, structure_name, inspection_date, 
               inspection_type, inspector_name, total_spans, conclusions,
               overall_bcicrit, overall_bciave
        FROM inspections
        WHERE structure_id = ? AND inspection_date = ?
      `, [structure_id, date], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!inspection) {
      return res.status(404).json({ error: 'Inspection not found' });
    }

    // 2. Get spans data
    const spans = await new Promise((resolve, reject) => {
      db.all(`
        SELECT span_number, elements_inspected, 
               photographs_taken, comments, bci_crit, bci_av
        FROM inspection_spans
        WHERE inspection_id = ?
        ORDER BY span_number
      `, [inspection.id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // 3. Get defects data
    const defects = await new Promise((resolve, reject) => {
      db.all(`
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
          timestamp
        FROM defects
        WHERE inspection_id = ?
        ORDER BY span_number, element_no, defect_no
      `, [inspection.id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // 4. Get photos for all defects in one query
    const defectPhotos = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          defect_id,
          photo_url,
          photo_description,
          display_order,
          front_defectid
        FROM defect_photos
        WHERE defect_id IN (SELECT id FROM defects WHERE inspection_id = ?)
        ORDER BY defect_id, display_order
      `, [inspection.id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

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
      // Inspection metadata
      structureId: inspection.structure_id,
      structureName: inspection.structure_name,
      inspectionDate: inspection.inspection_date,
      inspectionType: inspection.inspection_type,
      inspectorName: inspection.inspector_name,
      totalSpans: inspection.total_spans,
      conclusions: inspection.conclusions,
      overallBcicrit: inspection.overall_bcicrit,
      overallBciave: inspection.overall_bciave,

      // Spans data
      spans: spans.map(span => ({
        spanNumber: span.span_number,
        elementsInspected: Boolean(span.elements_inspected),
        photographsTaken: Boolean(span.photographs_taken),
        comments: span.comments || '',
        bciCrit: span.bci_crit,
        bciAv: span.bci_av
      })),

      // Defects data with photos
      defects: defects.map(defect => ({
        defectDbId: defect.id, // Include the defect's primary key
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
        photos: photosByDefect[defect.id] || [] // Add photos array for this defect
      }))
    };

    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});// GET /api/worksrequired
app.get('/api/worksrequired', async (req, res) => {
  const { structureId, date } = req.query;

  try {
    // 1. Get inspection metadata (consistent with your other endpoint)
    const inspection = await new Promise((resolve, reject) => {
      db.get(`
        SELECT id, structure_id, structure_name, inspection_date
        FROM inspections
        WHERE structure_id = ? AND inspection_date = ?
      `, [structureId, date], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!inspection) {
      return res.status(404).json({ error: 'Inspection not found' });
    }

    // 2. Get works required data
    const worksRequired = await new Promise((resolve, reject) => {
      db.all(`
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
        WHERE inspection_id = ?
        AND works_required IN ('Y')
        ORDER BY span_number, element_no
      `, [inspection.id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // 3. Format response consistently
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
        cost: item.cost ? `£${item.cost.toFixed(2)}` : 'Not specified' // Formatted cost
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
  limits: { fileSize: 50 * 1024 * 1024 }, // 10MB
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
  uploadInspectionPhotos.array('photos', 20),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ 
          success: false,
          error: 'No files were uploaded' 
        });
      }

      // Get the existing descriptions and display orders from the request
      const descriptions = req.body.descriptions || [];
      const displayOrders = req.body.displayOrders || [];

      const uploadedFiles = req.files.map((file, index) => ({
        originalName: file.originalname,
        filename: file.filename,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype,
        url: `/uploads/${path.relative(path.join(__dirname, 'uploads'), file.path).replace(/\\/g, '/')}`,
        // Preserve all the metadata from the frontend
        photo_description: descriptions[index] || '',
        display_order: displayOrders[index] || index,
        file_name: file.originalname,
        file_type: file.mimetype,
        // Add any other fields you need to preserve
      }));

      res.status(200).json({
        success: true,
        photoUrls: uploadedFiles.map(file => file.url), // Create array of just URLs
        photos: uploadedFiles, // Keep full objects if needed elsewhere
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
app.get('/api/bridges/:structureId/inspection-photos', (req, res) => {
    const { structureId } = req.params;
    const { inspectionDate } = req.query;

    // First get the inspection ID
    db.get(
        `SELECT id FROM inspections 
         WHERE structure_id = ? AND inspection_date = ?`,
        [structureId, inspectionDate],
        (err, inspection) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ 
                    success: false,
                    error: 'Database error' 
                });
            }

            if (!inspection) {
                return res.status(404).json({ 
                    success: false,
                    error: 'Inspection not found' 
                });
            }

            // Get all photos for this inspection
            db.all(
                `SELECT dp.* FROM defect_photos dp
                 JOIN defects d ON dp.defect_id = d.id
                 WHERE d.inspection_id = ?`,
                [inspection.id],
                (err, photos) => {
                    if (err) {
                        console.error('Database error:', err);
                        return res.status(500).json({ 
                            success: false,
                            error: 'Database error' 
                        });
                    }

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
                }
            );
        }
    );
});

//Authentication code.

// ADD SESSION MIDDLEWARE
app.use(session({
    secret: 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        secure: false, // set to true in production with HTTPS
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
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    console.log('Login attempt:', username);
    
    if (!username || !password) {
        return res.status(400).json({ 
            success: false, 
            message: 'Username and password required' 
        });
    }
    
    db.get(
        'SELECT * FROM users WHERE username = ?',
        [username],
        (err, user) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Server error' 
                });
            }
            
            if (!user) {
                console.log('User not found:', username);
                return res.status(401).json({ 
                    success: false, 
                    message: 'Invalid username or password' 
                });
            }
            
            // Simple password check (we'll add bcrypt later)
            if (password === user.password) {
                // Set session
                req.session.userId = user.id;
                req.session.username = user.username;
                req.session.organizationId = user.organization_id;
                req.session.role = user.role;
                
                console.log('Login successful for:', username);
                
                // Update last login
                db.run(
                    'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
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
        }
    );
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

// CHECK SESSION ENDPOINT (useful for debugging)
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
app.get('/api/bci-distribution', (req, res) => {
    const query = `
        SELECT 
            CASE 
                WHEN s.bci_av < 40 THEN '0-39'
                WHEN s.bci_av >= 40 AND s.bci_av < 50 THEN '40-49'
                WHEN s.bci_av >= 50 AND s.bci_av < 65 THEN '50-64'
                WHEN s.bci_av >= 65 AND s.bci_av < 80 THEN '65-79'
                WHEN s.bci_av >= 80 AND s.bci_av < 90 THEN '80-89'
                ELSE '90-100'
            END as bci_range,
            COUNT(DISTINCT i.structure_id) as count
        FROM inspections i
        JOIN (
            SELECT structure_id, MAX(inspection_date) as latest_date
            FROM inspections
            GROUP BY structure_id
        ) latest ON i.structure_id = latest.structure_id AND i.inspection_date = latest.latest_date
        JOIN inspection_spans s ON i.id = s.inspection_id
        WHERE s.bci_av IS NOT NULL
        GROUP BY bci_range
        ORDER BY 
            CASE bci_range
                WHEN '0-39' THEN 1
                WHEN '40-49' THEN 2
                WHEN '50-64' THEN 3
                WHEN '65-79' THEN 4
                WHEN '80-89' THEN 5
                ELSE 6
            END
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('BCI distribution error:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
        
        const ranges = ['0-39', '40-49', '50-64', '65-79', '80-89', '90-100'];
        const result = ranges.map(range => {
            const found = rows.find(r => r.bci_range === range);
            return { bci_range: range, count: found ? found.count : 0 };
        });
        
        res.json({ success: true, data: result });
    });
});


// 3. Condition Distribution Over Time - YEARLY (latest inspection per year)
app.get('/api/condition-distribution', (req, res) => {
    const query = `
        WITH yearly_latest AS (
            -- Get the latest inspection per structure per year
            SELECT 
                i.structure_id,
                CAST(strftime('%Y', i.inspection_date) AS INTEGER) as year,
                MAX(i.inspection_date) as latest_date
            FROM inspections i
            JOIN inspection_spans s ON i.id = s.inspection_id
            WHERE s.bci_av IS NOT NULL
            GROUP BY i.structure_id, CAST(strftime('%Y', i.inspection_date) AS INTEGER)
        ),
        yearly_bci AS (
            -- Get the BCI scores for those latest inspections
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
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Condition distribution error:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
        
        // Log the data for debugging
        console.log('Condition distribution data:', rows);
        
        res.json({ success: true, data: rows });
    });
});





// GET ALL BRIDGES (with last inspection date)
app.get('/api/bridges', async (req, res) => {
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT b.id, b.name, b.location, b.latitude, b.longitude, b.span, b.length, 
                b.built_year, b.type, b.span_number, b.OSE, b.OSN,
                b.primary_material, b.secondary_material, b.organization_id,
                MAX(i.inspection_date) as last_inspected
         FROM bridges b
         LEFT JOIN inspections i ON b.id = i.structure_id
         GROUP BY b.id
         ORDER BY b.name`,
        [],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// GET ALL INSPECTIONS (list for export page)
app.get('/api/inspections', async (req, res) => {
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, structure_id, structure_name, inspection_date, 
                inspection_type, inspector_name, total_spans, 
                created_at, conclusions, overall_bcicrit, overall_bciave
         FROM inspections 
         ORDER BY inspection_date DESC`,
        [],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// Critical bridges: lowest BCI per structure
app.get('/api/dashboard/critical-bridges', (req, res) => {
    const query = `
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
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Critical bridges error:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, data: rows });
    });
});


// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    db.exec("PRAGMA foreign_keys = ON");  // Optional safety measure
});

// Serve frontend static files
app.use(express.static(path.join(__dirname)));

// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
