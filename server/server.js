require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const { db, dbHelpers } = require('./database');
const { sendWelcomeEmail, sendResetEmail } = require('./emailService');
const Tesseract = require('tesseract.js');
const PDFDocument = require('pdfkit');
const franc = require('franc');

// ISO 639-3 → human-readable language name
// Note: 'sco' (Scots) maps to English — franc frequently swaps these two
// because they share nearly identical trigram profiles.
const LANGUAGE_NAMES = {
    eng: 'English',    sco: 'English',     fra: 'French',     spa: 'Spanish',
    deu: 'German',     por: 'Portuguese',  ita: 'Italian',    nld: 'Dutch',
    rus: 'Russian',    ukr: 'Ukrainian',   pol: 'Polish',     ces: 'Czech',
    slk: 'Slovak',     hun: 'Hungarian',   ron: 'Romanian',   bul: 'Bulgarian',
    hrv: 'Croatian',   srp: 'Serbian',     swe: 'Swedish',    nno: 'Norwegian',
    nob: 'Norwegian',  dan: 'Danish',      fin: 'Finnish',    tur: 'Turkish',
    ind: 'Indonesian', msa: 'Malay',       vie: 'Vietnamese', tha: 'Thai',
    hin: 'Hindi',      ben: 'Bengali',     arb: 'Arabic',     ara: 'Arabic',
    heb: 'Hebrew',     ell: 'Greek',       zho: 'Chinese',    jpn: 'Japanese',
    kor: 'Korean',     lat: 'Latin',       afr: 'Afrikaans',  cat: 'Catalan',
    swa: 'Swahili',    urd: 'Urdu',        fas: 'Persian',    tgl: 'Filipino',
    mlt: 'Maltese',    glg: 'Galician',    src: 'Serbian',
};

// Detect language from extracted text.
// Step 1: Unicode script analysis for non-Latin scripts.
// Step 2: franc with confidence-gap check for Latin-script languages.
function detectLanguage(text) {
    if (!text || text.replace(/\s/g, '').length < 15) {
        return 'Undetermined';
    }

    // --- Non-Latin script detection via Unicode block counts ---
    const chars = [...text];
    const counts = {};
    for (const ch of chars) {
        const cp = ch.codePointAt(0);
        if      (cp >= 0x0600 && cp <= 0x06FF) counts.arabic      = (counts.arabic      || 0) + 1;
        else if (cp >= 0x4E00 && cp <= 0x9FFF) counts.chinese     = (counts.chinese     || 0) + 1;
        else if (cp >= 0x3040 && cp <= 0x309F) counts.japanese    = (counts.japanese    || 0) + 1;
        else if (cp >= 0x30A0 && cp <= 0x30FF) counts.japanese    = (counts.japanese    || 0) + 1;
        else if (cp >= 0xAC00 && cp <= 0xD7AF) counts.korean      = (counts.korean      || 0) + 1;
        else if (cp >= 0x0400 && cp <= 0x04FF) counts.cyrillic    = (counts.cyrillic    || 0) + 1;
        else if (cp >= 0x0590 && cp <= 0x05FF) counts.hebrew      = (counts.hebrew      || 0) + 1;
        else if (cp >= 0x0370 && cp <= 0x03FF) counts.greek       = (counts.greek       || 0) + 1;
        else if (cp >= 0x0E00 && cp <= 0x0E7F) counts.thai        = (counts.thai        || 0) + 1;
        else if (cp >= 0x0900 && cp <= 0x097F) counts.devanagari  = (counts.devanagari  || 0) + 1;
    }

    const total = chars.length;
    const topScript = Object.entries(counts).sort(([, a], [, b]) => b - a)[0];
    if (topScript && topScript[1] / total > 0.08) {
        const scriptToLang = {
            arabic:     'Arabic',
            chinese:    'Chinese',
            japanese:   'Japanese',
            korean:     'Korean',
            hebrew:     'Hebrew',
            greek:      'Greek',
            thai:       'Thai',
            devanagari: 'Hindi / Devanagari',
            cyrillic:   'Cyrillic script',
        };
        return scriptToLang[topScript[0]] || 'Unknown script';
    }

    // --- Latin script: strip OCR noise then run franc ---
    let cleanText = text
        .replace(/[^a-zA-ZÀ-ÖØ-öø-ÿ\s]/g, ' ')  // strip digits/punctuation
        .replace(/\s+/g, ' ')
        .trim();

    // Tesseract sometimes spaces out individual characters on decorative or
    // letter-spaced fonts: "L E F U T U R". Detect this by checking whether
    // >55 % of tokens are single characters, then collapse them so franc can
    // read the trigram patterns correctly.
    const tokens = cleanText.split(' ').filter(t => t.length > 0);
    if (tokens.length >= 5) {
        const singleRatio = tokens.filter(t => t.length === 1).length / tokens.length;
        if (singleRatio > 0.55) {
            cleanText = cleanText.replace(
                /(?:^|(?<=\s))([A-ZÀ-Öa-zØ-öø-ÿ] )*[A-ZÀ-Öa-zØ-öø-ÿ](?=\s|$)/g,
                m => m.replace(/\s/g, '')
            );
            cleanText = cleanText.replace(/\s+/g, ' ').trim();
        }
    }

    // Need at least 30 clean characters for franc to be reliable
    if (cleanText.length < 30) return 'Undetermined';

    const candidates = franc.all(cleanText, { minLength: 10 });
    if (!candidates || candidates.length === 0) return 'Undetermined';

    const [topCode, topConf] = candidates[0];
    if (topCode === 'und') return 'Undetermined';

    // Accept result if: high confidence, OR clear gap over 2nd candidate
    const gap = candidates.length > 1 ? topConf - candidates[1][1] : 1;
    if (topConf < 0.85 && gap < 0.05) return 'Undetermined';

    return LANGUAGE_NAMES[topCode] || topCode.toUpperCase();
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'ocrify_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));
app.use(express.static(path.join(__dirname, '../public')));

// Auth guard middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    res.redirect('/');
}

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

// Multer for message attachments — accepts any file type up to 25 MB
const msgAttachDir = path.join(__dirname, '../uploads/message-attachments');
const msgAttachUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            if (!fs.existsSync(msgAttachDir)) fs.mkdirSync(msgAttachDir, { recursive: true });
            cb(null, msgAttachDir);
        },
        filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
    }),
    limits: { fileSize: 25 * 1024 * 1024 }
});

// API Routes

// Register
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);

        dbHelpers.createAccount(username, email, passwordHash, (err, accountId) => {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(409).json({ error: 'Email already registered' });
                }
                return res.status(500).json({ error: 'Registration failed' });
            }

            req.session.userId = accountId;
            req.session.username = username;
            req.session.email = email;

            // Send welcome email (non-blocking)
            sendWelcomeEmail(email, username).catch(err =>
                console.error('Welcome email failed:', err.message)
            );

            res.json({ success: true });
        });
    } catch (err) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    dbHelpers.findAccountByEmail(email, async (err, account) => {
        if (err || !account) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const match = await bcrypt.compare(password, account.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        req.session.userId = account.id;
        req.session.username = account.username;
        req.session.email = account.email;
        res.json({ success: true });
    });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

// Forgot password — send recovery code
app.post('/api/auth/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    dbHelpers.findAccountByEmail(email, async (err, account) => {
        if (err || !account) {
            // Don't reveal whether the email exists
            return res.json({ success: true });
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();

        dbHelpers.saveResetToken(email, code, async (err) => {
            if (err) return res.status(500).json({ error: 'Failed to generate code' });

            sendResetEmail(email, account.username, code).catch(err =>
                console.error('Reset email failed:', err.message)
            );

            res.json({ success: true });
        });
    });
});

// Reset password — verify code and set new password
app.post('/api/auth/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    dbHelpers.findResetToken(email, code, async (err, record) => {
        if (err || !record) {
            return res.status(400).json({ error: 'Invalid or expired code' });
        }

        try {
            const passwordHash = await bcrypt.hash(newPassword, 10);
            dbHelpers.updatePassword(email, passwordHash, (err) => {
                if (err) return res.status(500).json({ error: 'Failed to update password' });
                dbHelpers.markTokenUsed(record.id, () => {});
                res.json({ success: true });
            });
        } catch {
            res.status(500).json({ error: 'Failed to update password' });
        }
    });
});

// Get current session user
app.get('/api/auth/me', (req, res) => {
    if (req.session && req.session.userId) {
        return res.json({
            loggedIn: true,
            userId: req.session.userId,
            username: req.session.username,
            email: req.session.email
        });
    }
    res.json({ loggedIn: false });
});

// Get or create user session
app.post('/api/get-user-session', (req, res) => {
    const accountId = req.session && req.session.userId ? req.session.userId : null;

    function createAndReturn() {
        dbHelpers.getNextUserPosition((err, userPosition) => {
            if (err) return res.status(500).json({ error: 'Failed to create user session' });
            dbHelpers.createUser(userPosition, accountId, (err, userId) => {
                if (err) return res.status(500).json({ error: 'Failed to create user' });
                const userOutputDir = path.join(__dirname, '../output', userPosition);
                if (!fs.existsSync(userOutputDir)) fs.mkdirSync(userOutputDir, { recursive: true });
                res.json({ userPosition, userId });
            });
        });
    }

    if (accountId) {
        // Logged-in user: reuse their existing position if one exists
        dbHelpers.getUserPositionByAccountId(accountId, (err, row) => {
            if (!err && row) {
                return res.json({ userPosition: row.user_queue_position });
            }
            createAndReturn();
        });
    } else {
        createAndReturn();
    }
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

        // Add file record to database
        const fileData = {
            file_name: originalName,
            user_queue_position: userPosition,
            file_type: fileType,
            output_file_type: outputFormat || 'TXT'
        };

        dbHelpers.addFile(fileData, async (err, fileId) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to add file record' });
            }

            // Update user statistics
            dbHelpers.updateUserStats(userPosition, () => {});

            // Update user extraction start timestamp
            dbHelpers.updateUserExtractionStart(userPosition, () => {});

            try {
                // Perform OCR using Tesseract
                const { data } = await Tesseract.recognize(filePath, 'eng', {
                    logger: m => console.log(m)
                });

                const extractedText = data.text;
                const detectedLanguage = detectLanguage(extractedText);

                // Update file record with OCR results
                dbHelpers.updateFileAfterOCR(fileId, detectedLanguage, 'success', (err) => {
                    if (err) {
                        console.error('Error updating file record:', err);
                    }
                });

                // Update user extraction end timestamp
                dbHelpers.updateUserExtractionEnd(userPosition, true, () => {});

                // Generate output file using timestamp-based name
                const userOutputDir = path.join(__dirname, '../output', userPosition);
                const outputFileBaseName = `file_${Date.now()}`;
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

                // Save output filename so it can be attached to messages later
                const outputFileName = path.basename(outputFilePath);
                dbHelpers.saveOutputFileName(fileId, outputFileName);

                // Clean up uploaded file
                fs.unlinkSync(filePath);

                res.json({
                    success: true,
                    fileId,
                    extractedText,
                    detectedLanguage,
                    outputFileName,
                    downloadUrl: `/api/download/${userPosition}/${outputFileName}`
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

                // Add file record
                const fileData = {
                    file_name: originalName,
                    user_queue_position: userPosition,
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

                        try {
                            // Perform OCR
                            const { data } = await Tesseract.recognize(filePath, 'eng');
                            const extractedText = data.text;
                            const detectedLanguage = detectLanguage(extractedText);

                            // Update file record
                            dbHelpers.updateFileAfterOCR(fileId, detectedLanguage, 'success', () => {});

                            // Generate output file
                            const userOutputDir = path.join(__dirname, '../output', userPosition);
                            const outputFileBaseName = `file_${Date.now()}`;
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

// Upload multiple files and combine OCR results into one output file
app.post('/api/upload-combined', upload.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const { userPosition, outputFormat } = req.body;
        if (!userPosition) {
            return res.status(400).json({ error: 'User position is required' });
        }

        dbHelpers.updateUserExtractionStart(userPosition, () => {});

        const sections = [];
        let failCount = 0;

        for (const file of req.files) {
            try {
                const { data } = await Tesseract.recognize(file.path, 'eng');
                sections.push({ name: file.originalname, text: data.text.trim(), success: true });
            } catch (ocrErr) {
                sections.push({ name: file.originalname, text: `[OCR failed: ${ocrErr.message}]`, success: false });
                failCount++;
            } finally {
                try { fs.unlinkSync(file.path); } catch {}
            }
        }

        const separator = '='.repeat(48);
        const combinedText = sections
            .map(s => `=== ${s.name} ===\n\n${s.text}`)
            .join(`\n\n${separator}\n\n`);

        const detectedLanguage = detectLanguage(combinedText);
        const successCount = sections.filter(s => s.success).length;

        const userOutputDir = path.join(__dirname, '../output', userPosition);
        if (!fs.existsSync(userOutputDir)) fs.mkdirSync(userOutputDir, { recursive: true });

        const baseName = `combined_${Date.now()}`;
        let outputFilePath, outputFileName;

        if (outputFormat === 'PDF') {
            outputFileName = `${baseName}.pdf`;
            outputFilePath = path.join(userOutputDir, outputFileName);
            const doc = new PDFDocument();
            doc.pipe(fs.createWriteStream(outputFilePath));
            doc.fontSize(12).text(combinedText, 100, 100);
            doc.end();
        } else {
            outputFileName = `${baseName}.txt`;
            outputFilePath = path.join(userOutputDir, outputFileName);
            fs.writeFileSync(outputFilePath, combinedText);
        }

        const fileData = {
            file_name: `combined_${req.files.length}_files`,
            user_queue_position: userPosition,
            file_type: 'MULTI',
            output_file_type: outputFormat || 'TXT'
        };

        const fileId = await new Promise((resolve, reject) => {
            dbHelpers.addFile(fileData, (err, id) => err ? reject(err) : resolve(id));
        });

        dbHelpers.updateUserStats(userPosition, () => {});
        dbHelpers.updateFileAfterOCR(fileId, detectedLanguage, 'success', () => {});
        dbHelpers.saveOutputFileName(fileId, outputFileName);
        dbHelpers.updateUserExtractionEndBulk(userPosition, successCount, failCount, () => {});

        res.json({
            success: true,
            fileId,
            extractedText: combinedText,
            detectedLanguage,
            outputFileName,
            downloadUrl: `/api/download/${userPosition}/${outputFileName}`
        });

    } catch (error) {
        console.error('Combined upload error:', error);
        res.status(500).json({ error: 'Combined upload failed', details: error.message });
    }
});

// Translate extracted text via MyMemory (free, no API key required)
// MyMemory limit: 500 words per request — long texts are split into chunks.

// Translate a plain block of text (no headers) in 400-word chunks
async function translatePlainText(text, target) {
    const words  = text.trim().split(/\s+/);
    const chunks = [];
    for (let i = 0; i < words.length; i += 400) {
        chunks.push(words.slice(i, i + 400).join(' '));
    }

    const translated = [];
    for (const chunk of chunks) {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=autodetect|${target}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const data     = await response.json();

        if (data.responseStatus !== 200) {
            throw new Error(data.responseDetails || 'Translation failed');
        }
        translated.push(data.responseData.translatedText);
    }
    return translated.join(' ');
}

app.post('/api/translate', async (req, res) => {
    const { text, target } = req.body;
    if (!text || !target) {
        return res.status(400).json({ error: 'text and target language are required' });
    }

    try {
        const SEPARATOR    = '\n\n' + '='.repeat(48) + '\n\n';
        const HEADER_RE    = /^(=== .+ ===)\n\n([\s\S]*)$/;

        // Combined multi-file text: translate each section independently
        if (text.includes(SEPARATOR)) {
            const sections           = text.split(SEPARATOR);
            const translatedSections = [];

            for (const section of sections) {
                const match = section.match(HEADER_RE);
                if (match) {
                    const header         = match[1];
                    const sectionText    = match[2];
                    const translatedBody = await translatePlainText(sectionText, target);
                    translatedSections.push(`${header}\n\n${translatedBody}`);
                } else {
                    translatedSections.push(section);
                }
            }

            return res.json({ translatedText: translatedSections.join(SEPARATOR) });
        }

        // Single-file text — translate normally
        const translatedText = await translatePlainText(text, target);
        res.json({ translatedText });

    } catch (err) {
        console.error('Translation error:', err.message);
        res.status(502).json({ error: err.message || 'Could not reach the translation service' });
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

// Get a single file's result — returns metadata + extracted text content
app.get('/api/files/:userPosition/:fileId/result', (req, res) => {
    const { userPosition, fileId } = req.params;

    dbHelpers.getFileById(parseInt(fileId), userPosition, (err, file) => {
        if (err || !file) return res.status(404).json({ error: 'File not found' });

        if (!file.output_file_name || file.extraction_state !== 'success') {
            return res.json({ file, extractedText: null });
        }

        const outputPath = path.join(__dirname, '../output', userPosition, file.output_file_name);

        if (!fs.existsSync(outputPath)) {
            return res.json({ file, extractedText: null });
        }

        if (file.output_file_type === 'PDF') {
            return res.json({
                file,
                extractedText: null,
                isPdf: true,
                downloadUrl: `/api/download/${userPosition}/${file.output_file_name}`
            });
        }

        try {
            const extractedText = fs.readFileSync(outputPath, 'utf8');
            res.json({
                file,
                extractedText,
                downloadUrl: `/api/download/${userPosition}/${file.output_file_name}`
            });
        } catch {
            res.json({ file, extractedText: null });
        }
    });
});

// ── Chat: Messages ──────────────────────────────────────────────────────────

app.get('/api/messages/unread', requireAuth, (req, res) => {
    dbHelpers.getUnreadCount(req.session.userId, (err, row) => {
        const dmCount = (!err && row) ? (row.count || 0) : 0;
        dbHelpers.getGroupUnreadTotal(req.session.userId, (err2, row2) => {
            const groupCount = (!err2 && row2) ? (row2.total || 0) : 0;
            res.json({ count: dmCount + groupCount });
        });
    });
});

app.get('/api/messages/inbox', requireAuth, (req, res) => {
    dbHelpers.getInbox(req.session.userId, (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ messages: rows });
    });
});

app.get('/api/messages/sent', requireAuth, (req, res) => {
    dbHelpers.getSent(req.session.userId, (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ messages: rows });
    });
});

app.get('/api/messages/starred', requireAuth, (req, res) => {
    dbHelpers.getStarred(req.session.userId, (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ messages: rows });
    });
});

app.get('/api/messages/trash', requireAuth, (req, res) => {
    dbHelpers.getTrash(req.session.userId, (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ messages: rows });
    });
});

app.get('/api/messages/search', requireAuth, (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ messages: [] });
    dbHelpers.searchMessages(req.session.userId, q, (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ messages: rows });
    });
});

app.get('/api/messages/:id/thread', requireAuth, (req, res) => {
    const msgId = parseInt(req.params.id);
    dbHelpers.getMessage(msgId, req.session.userId, (err, msg) => {
        if (err || !msg) return res.status(404).json({ error: 'Message not found' });
        const otherId = msg.sender_id === req.session.userId ? msg.receiver_id : msg.sender_id;
        dbHelpers.markThreadRead(req.session.userId, otherId);
        dbHelpers.getConversationThread(req.session.userId, otherId, (err2, messages) => {
            if (err2) return res.status(500).json({ error: 'DB error' });
            res.json({ messages });
        });
    });
});

app.get('/api/messages/:id', requireAuth, (req, res) => {
    const msgId = parseInt(req.params.id);
    dbHelpers.getMessage(msgId, req.session.userId, (err, msg) => {
        if (err || !msg) return res.status(404).json({ error: 'Message not found' });
        dbHelpers.markRead(msgId, req.session.userId);
        res.json({ message: msg });
    });
});

app.post('/api/messages/send', requireAuth, (req, res) => {
    const { toEmail, subject, body, attachedFileId, attachedFileName } = req.body;
    if (!toEmail || !body) return res.status(400).json({ error: 'Recipient and body are required' });

    dbHelpers.findAccountByEmail(toEmail.trim(), (err, receiver) => {
        if (err || !receiver) return res.status(404).json({ error: 'Recipient not found' });
        if (receiver.id === req.session.userId) return res.status(400).json({ error: 'Cannot send to yourself' });

        dbHelpers.sendMessage(
            req.session.userId, receiver.id, subject, body,
            attachedFileId || null, attachedFileName || null, null,
            (err, msgId) => {
                if (err) return res.status(500).json({ error: 'Failed to send message' });
                res.json({ success: true, messageId: msgId });
            }
        );
    });
});

// Send message with a device file attachment (multipart/form-data)
app.post('/api/messages/send-file', requireAuth, msgAttachUpload.single('attachment'), (req, res) => {
    const { toEmail, subject, body } = req.body;
    if (!toEmail || !body) return res.status(400).json({ error: 'Recipient and body are required' });

    dbHelpers.findAccountByEmail(toEmail.trim(), (err, receiver) => {
        if (err || !receiver) return res.status(404).json({ error: 'Recipient not found' });
        if (receiver.id === req.session.userId) return res.status(400).json({ error: 'Cannot send to yourself' });

        const attachmentPath   = req.file ? req.file.filename          : null;
        const attachedFileName = req.file ? req.file.originalname      : null;

        dbHelpers.sendMessage(
            req.session.userId, receiver.id, subject, body,
            null, attachedFileName, attachmentPath,
            (err, msgId) => {
                if (err) return res.status(500).json({ error: 'Failed to send message' });
                res.json({ success: true, messageId: msgId });
            }
        );
    });
});

app.put('/api/messages/:id/star', requireAuth, (req, res) => {
    dbHelpers.toggleStar(parseInt(req.params.id), req.session.userId, (err) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ success: true });
    });
});

app.put('/api/messages/:id/trash', requireAuth, (req, res) => {
    dbHelpers.trashMessage(parseInt(req.params.id), req.session.userId, (err) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ success: true });
    });
});

app.put('/api/messages/:id/restore', requireAuth, (req, res) => {
    dbHelpers.restoreMessage(parseInt(req.params.id), req.session.userId, (err) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ success: true });
    });
});

app.delete('/api/messages/:id', requireAuth, (req, res) => {
    dbHelpers.deleteMessagePermanent(parseInt(req.params.id), req.session.userId, (err) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ success: true });
    });
});

// Serve message attachment — handles both OCR files and direct device uploads
app.get('/api/messages/:id/attachment', requireAuth, (req, res) => {
    dbHelpers.getMessage(parseInt(req.params.id), req.session.userId, (err, msg) => {
        if (err || !msg) return res.status(404).json({ error: 'Attachment not found' });

        if (msg.attachment_path) {
            const filePath = path.join(msgAttachDir, msg.attachment_path);
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File no longer available' });
            return res.download(filePath, msg.attached_file_name || path.basename(msg.attachment_path));
        }

        if (!msg.attached_file_id) return res.status(404).json({ error: 'Attachment not found' });
        const filePath = path.join(__dirname, '../output', msg.file_user_position, msg.attached_file_name);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File no longer available' });
        res.download(filePath);
    });
});

// ── Chat: Friends ────────────────────────────────────────────────────────────

app.get('/api/friends', requireAuth, (req, res) => {
    dbHelpers.getFriends(req.session.userId, (err, friends) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        dbHelpers.getPendingRequests(req.session.userId, (err2, pending) => {
            if (err2) return res.status(500).json({ error: 'DB error' });
            res.json({ friends, pending });
        });
    });
});

app.post('/api/friends/request', requireAuth, (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    dbHelpers.findAccountByEmail(email.trim(), (err, addressee) => {
        if (err || !addressee) return res.status(404).json({ error: 'User not found' });
        if (addressee.id === req.session.userId) return res.status(400).json({ error: 'Cannot add yourself' });

        dbHelpers.sendFriendRequest(req.session.userId, addressee.id, (err) => {
            if (err) return res.status(409).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

app.put('/api/friends/:id/accept', requireAuth, (req, res) => {
    dbHelpers.respondFriendRequest(parseInt(req.params.id), req.session.userId, 'accepted', (err) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ success: true });
    });
});

app.put('/api/friends/:id/reject', requireAuth, (req, res) => {
    dbHelpers.respondFriendRequest(parseInt(req.params.id), req.session.userId, 'rejected', (err) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ success: true });
    });
});

app.get('/api/users/search', requireAuth, (req, res) => {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ users: [] });
    dbHelpers.searchUsers(q, req.session.userId, (err, users) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ users });
    });
});

// ── Groups ───────────────────────────────────────────────────────────────────

app.post('/api/groups/create', requireAuth, (req, res) => {
    const { memberEmails, name, body, attachedFileId, attachedFileName } = req.body;
    if (!memberEmails || !memberEmails.length || !body)
        return res.status(400).json({ error: 'Recipients and message body are required' });

    const emails      = [...new Set(memberEmails.map(e => e.trim()).filter(Boolean))];
    let resolved      = 0;
    const memberIds   = [];
    const notFound    = [];

    emails.forEach(email => {
        dbHelpers.findAccountByEmail(email, (err, account) => {
            if (!err && account && account.id !== req.session.userId)
                memberIds.push(account.id);
            else if (!account || err)
                notFound.push(email);
            if (++resolved === emails.length) {
                if (memberIds.length === 0)
                    return res.status(400).json({ error: 'No valid recipients found. Make sure they are registered on OCRify.', notFound });

                const groupName = name ||
                    (emails.length === 1 ? `Group with ${emails[0]}` : `Group (${emails.length + 1} people)`);

                dbHelpers.createGroup(groupName, req.session.userId, memberIds, (err2, groupId) => {
                    if (err2) return res.status(500).json({ error: 'Failed to create group' });
                    dbHelpers.sendGroupMessage(
                        groupId, req.session.userId, body,
                        attachedFileId || null, attachedFileName || null, null,
                        (err3) => {
                            if (err3) return res.status(500).json({ error: 'Failed to send message' });
                            res.json({ success: true, groupId, notFound });
                        }
                    );
                });
            }
        });
    });
});

app.get('/api/groups', requireAuth, (req, res) => {
    dbHelpers.getUserGroups(req.session.userId, (err, groups) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ groups: groups || [] });
    });
});

app.get('/api/groups/:id', requireAuth, (req, res) => {
    const groupId = parseInt(req.params.id);
    dbHelpers.isGroupMember(groupId, req.session.userId, (err, isMember) => {
        if (err || !isMember) return res.status(403).json({ error: 'Access denied' });
        dbHelpers.getGroup(groupId, (err2, group) => {
            if (err2 || !group) return res.status(404).json({ error: 'Group not found' });
            dbHelpers.getGroupMembers(groupId, (err3, members) => {
                if (err3) return res.status(500).json({ error: 'DB error' });
                res.json({ group, members: members || [] });
            });
        });
    });
});

app.get('/api/groups/:id/messages', requireAuth, (req, res) => {
    const groupId = parseInt(req.params.id);
    dbHelpers.isGroupMember(groupId, req.session.userId, (err, isMember) => {
        if (err || !isMember) return res.status(403).json({ error: 'Access denied' });
        dbHelpers.markGroupRead(groupId, req.session.userId);
        dbHelpers.getGroupMessages(groupId, (err2, messages) => {
            if (err2) return res.status(500).json({ error: 'DB error' });
            res.json({ messages: messages || [] });
        });
    });
});

app.post('/api/groups/:id/messages', requireAuth, msgAttachUpload.single('attachment'), (req, res) => {
    const groupId = parseInt(req.params.id);
    dbHelpers.isGroupMember(groupId, req.session.userId, (err, isMember) => {
        if (err || !isMember) return res.status(403).json({ error: 'Access denied' });
        const { body } = req.body;
        if (!body && !req.file) return res.status(400).json({ error: 'Message is required' });
        const attachmentPath   = req.file ? req.file.filename     : null;
        const attachedFileName = req.file ? req.file.originalname : null;
        dbHelpers.sendGroupMessage(
            groupId, req.session.userId, body || '',
            null, attachedFileName, attachmentPath,
            (err2) => {
                if (err2) return res.status(500).json({ error: 'Failed to send message' });
                res.json({ success: true });
            }
        );
    });
});

app.get('/api/groups/:id/attachment/:msgId', requireAuth, (req, res) => {
    const groupId = parseInt(req.params.id);
    const msgId   = parseInt(req.params.msgId);
    dbHelpers.isGroupMember(groupId, req.session.userId, (err, isMember) => {
        if (err || !isMember) return res.status(403).json({ error: 'Access denied' });
        dbHelpers.getGroupMessages(groupId, (err2, messages) => {
            if (err2) return res.status(500).json({ error: 'DB error' });
            const msg = messages.find(m => m.id === msgId);
            if (!msg) return res.status(404).json({ error: 'Message not found' });
            if (msg.attachment_path) {
                const filePath = path.join(msgAttachDir, msg.attachment_path);
                if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
                return res.download(filePath, msg.attached_file_name || msg.attachment_path);
            }
            if (msg.attached_file_id && msg.file_user_position) {
                const filePath = path.join(__dirname, '../output', msg.file_user_position, msg.attached_file_name);
                if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
                return res.download(filePath);
            }
            res.status(404).json({ error: 'No attachment' });
        });
    });
});

// Serve HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/page1_ocrify_user_dashboard.html'));
});

app.get('/login', (req, res) => {
    if (req.session && req.session.userId) return res.redirect('/');
    res.sendFile(path.join(__dirname, '../public/html/page2_login.html'));
});

app.get('/signup', (req, res) => {
    if (req.session && req.session.userId) return res.redirect('/');
    res.sendFile(path.join(__dirname, '../public/html/page3_signup.html'));
});

app.get('/chat', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/page6_chats.html'));
});

app.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/page4_forgot_password.html'));
});

app.get('/reset-password', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/page5_reset_password.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`OCRify server running on http://localhost:${PORT}`);
});
