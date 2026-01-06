const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db, dbHelpers } = require('./database');
const Tesseract = require('tesseract.js');
const PDFDocument = require('pdfkit');
const { generateAIFileName } = require('./aiNaming');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|bmp|tiff|pdf/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// API Routes

// Get or create user session
app.post('/api/get-user-session', (req, res) => {
    dbHelpers.getNextUserPosition((err, userPosition) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to create user session' });
        }

        dbHelpers.createUser(userPosition, (err, userId) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to create user' });
            }

            // Increment total number of users
            dbHelpers.incrementUserCount(() => {});

            // Create output directory for user
            const userOutputDir = path.join(__dirname, '../output', userPosition);
            if (!fs.existsSync(userOutputDir)) {
                fs.mkdirSync(userOutputDir, { recursive: true });
            }

            res.json({ userPosition, userId });
        });
    });
});

// Upload and process file
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { userPosition, outputFormat } = req.body;

        if (!userPosition) {
            return res.status(400).json({ error: 'User position is required' });
        }

        const filePath = req.file.path;
        const originalName = req.file.originalname;
        const fileType = path.extname(originalName).substring(1).toUpperCase();
        const fileExtension = path.extname(originalName);

        // Temporary AI filename (will be updated after OCR)
        const tempAIFileName = `processing_${Date.now()}${fileExtension}`;

        // Add file record to database
        const fileData = {
            file_name: originalName,
            user_queue_position: userPosition,
            ai_file_name: tempAIFileName,
            file_type: fileType,
            output_file_type: outputFormat || 'TXT'
        };

        dbHelpers.addFile(fileData, async (err, fileId) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to add file record' });
            }

            // Update user and developer statistics
            dbHelpers.updateUserStats(userPosition, () => {});
            dbHelpers.incrementFileCount(() => {});

            // Update user extraction start timestamp
            dbHelpers.updateUserExtractionStart(userPosition, () => {});

            try {
                // Perform OCR using Tesseract
                const { data } = await Tesseract.recognize(filePath, 'eng', {
                    logger: m => console.log(m)
                });

                const extractedText = data.text;
                const detectedLanguage = data.text ? 'eng' : 'unknown';

                // Generate AI-based filename from extracted text
                const aiFileName = generateAIFileName(extractedText, fileExtension);

                // Update file record with OCR results and AI filename
                dbHelpers.updateFileAfterOCR(fileId, detectedLanguage, 'success', (err) => {
                    if (err) {
                        console.error('Error updating file record:', err);
                    }
                });

                // Update AI filename in database
                db.run(`UPDATE dbt3_file SET ai_file_name = ? WHERE id = ?`,
                    [aiFileName, fileId],
                    (err) => {
                        if (err) console.error('Error updating AI filename:', err);
                    }
                );

                // Update user extraction end timestamp
                dbHelpers.updateUserExtractionEnd(userPosition, true, () => {});

                // Generate output file using AI-based name
                const userOutputDir = path.join(__dirname, '../output', userPosition);
                const outputFileBaseName = path.parse(aiFileName).name;
                let outputFilePath;

                if (outputFormat === 'PDF') {
                    outputFilePath = path.join(userOutputDir, `${outputFileBaseName}.pdf`);

                    // Create PDF
                    const doc = new PDFDocument();
                    doc.pipe(fs.createWriteStream(outputFilePath));
                    doc.fontSize(12).text(extractedText, 100, 100);
                    doc.end();
                } else {
                    // Default to TXT
                    outputFilePath = path.join(userOutputDir, `${outputFileBaseName}.txt`);
                    fs.writeFileSync(outputFilePath, extractedText);
                }

                // Clean up uploaded file
                fs.unlinkSync(filePath);

                res.json({
                    success: true,
                    fileId,
                    extractedText,
                    detectedLanguage,
                    aiFileName,
                    outputFileName: path.basename(outputFilePath),
                    downloadUrl: `/api/download/${userPosition}/${path.basename(outputFilePath)}`
                });

            } catch (ocrError) {
                console.error('OCR Error:', ocrError);

                // Update file record as failed
                dbHelpers.updateFileAfterOCR(fileId, 'unknown', 'failed', () => {});

                // Update user extraction end timestamp (failed)
                dbHelpers.updateUserExtractionEnd(userPosition, false, () => {});

                res.status(500).json({
                    error: 'OCR processing failed',
                    details: ocrError.message
                });
            }
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed', details: error.message });
    }
});

// Bulk upload and process multiple files
app.post('/api/upload-bulk', upload.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const { userPosition, outputFormat } = req.body;

        if (!userPosition) {
            return res.status(400).json({ error: 'User position is required' });
        }

        const results = [];

        // Update user extraction start timestamp
        dbHelpers.updateUserExtractionStart(userPosition, () => {});

        for (const file of req.files) {
            try {
                const filePath = file.path;
                const originalName = file.originalname;
                const fileType = path.extname(originalName).substring(1).toUpperCase();
                const fileExtension = path.extname(originalName);

                // Temporary AI filename
                const tempAIFileName = `processing_${Date.now()}${fileExtension}`;

                // Add file record
                const fileData = {
                    file_name: originalName,
                    user_queue_position: userPosition,
                    ai_file_name: tempAIFileName,
                    file_type: fileType,
                    output_file_type: outputFormat || 'TXT'
                };

                await new Promise((resolve, reject) => {
                    dbHelpers.addFile(fileData, async (err, fileId) => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        // Update statistics
                        dbHelpers.updateUserStats(userPosition, () => {});
                        dbHelpers.incrementFileCount(() => {});

                        try {
                            // Perform OCR
                            const { data } = await Tesseract.recognize(filePath, 'eng');
                            const extractedText = data.text;
                            const detectedLanguage = data.text ? 'eng' : 'unknown';

                            // Generate AI filename
                            const aiFileName = generateAIFileName(extractedText, fileExtension);

                            // Update file record
                            dbHelpers.updateFileAfterOCR(fileId, detectedLanguage, 'success', () => {});

                            // Update AI filename
                            db.run(`UPDATE dbt3_file SET ai_file_name = ? WHERE id = ?`, [aiFileName, fileId], () => {});

                            // Generate output file
                            const userOutputDir = path.join(__dirname, '../output', userPosition);
                            const outputFileBaseName = path.parse(aiFileName).name;
                            let outputFilePath;

                            if (outputFormat === 'PDF') {
                                outputFilePath = path.join(userOutputDir, `${outputFileBaseName}.pdf`);
                                const doc = new PDFDocument();
                                doc.pipe(fs.createWriteStream(outputFilePath));
                                doc.fontSize(12).text(extractedText, 100, 100);
                                doc.end();
                            } else {
                                outputFilePath = path.join(userOutputDir, `${outputFileBaseName}.txt`);
                                fs.writeFileSync(outputFilePath, extractedText);
                            }

                            // Clean up
                            fs.unlinkSync(filePath);

                            results.push({
                                success: true,
                                originalName,
                                aiFileName,
                                fileId,
                                outputFileName: path.basename(outputFilePath)
                            });

                            resolve();
                        } catch (ocrError) {
                            console.error('OCR Error:', ocrError);
                            dbHelpers.updateFileAfterOCR(fileId, 'unknown', 'failed', () => {});

                            results.push({
                                success: false,
                                originalName,
                                error: ocrError.message
                            });

                            resolve();
                        }
                    });
                });

            } catch (error) {
                results.push({
                    success: false,
                    originalName: file.originalname,
                    error: error.message
                });
            }
        }

        // Update user extraction end timestamp
        const successCount = results.filter(r => r.success).length;
        const failCount = results.length - successCount;
        dbHelpers.updateUserExtractionEndBulk(userPosition, successCount, failCount, () => {});

        res.json({
            success: true,
            totalFiles: req.files.length,
            results
        });

    } catch (error) {
        console.error('Bulk upload error:', error);
        res.status(500).json({ error: 'Bulk upload failed', details: error.message });
    }
});

// Download processed file
app.get('/api/download/:userPosition/:filename', (req, res) => {
    const { userPosition, filename } = req.params;
    const filePath = path.join(__dirname, '../output', userPosition, filename);

    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// Get user file history
app.get('/api/files/:userPosition', (req, res) => {
    const { userPosition } = req.params;

    dbHelpers.getUserFiles(userPosition, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to retrieve files' });
        }
        res.json({ files });
    });
});

// Developer login endpoint
app.post('/api/dev/login', (req, res) => {
    const { email, password } = req.body;

    // Simple authentication (in production, use proper password hashing)
    if (email === 'modeblackmng@gmail.com' && password === '123456789dix') {
        // Update developer connection status
        db.run(`UPDATE dbt1_developer
                SET connected_at = datetime('now'),
                    last_seen = datetime('now'),
                    connection_state = 'connected'
                WHERE app_email = ?`,
                [email],
                (err) => {
                    if (err) {
                        return res.status(500).json({ error: 'Login failed' });
                    }
                    res.json({ success: true, message: 'Login successful' });
                }
        );
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Developer logout
app.post('/api/dev/logout', (req, res) => {
    db.run(`UPDATE dbt1_developer
            SET connection_state = 'disconnected',
                last_seen = datetime('now')
            WHERE app_email = 'modeblackmng@gmail.com'`,
            (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Logout failed' });
                }
                res.json({ success: true, message: 'Logged out successfully' });
            }
    );
});

// Serve HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/page1_ocrify_user_dashboard.html'));
});

app.get('/dev', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/page2_dev_login.html'));
});

app.get('/dev/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/page3_dev_dashboard.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`OCRify server running on http://localhost:${PORT}`);
});
