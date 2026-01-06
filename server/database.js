const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database/modeblack.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the modeblack database.');
        initializeTables();
    }
});

function initializeTables() {
    db.serialize(() => {
        // dbt1 - Developer table
        db.run(`CREATE TABLE IF NOT EXISTS dbt1_developer (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            developer_name TEXT NOT NULL,
            app_email TEXT NOT NULL UNIQUE,
            app_token TEXT,
            account_created_at TEXT DEFAULT (datetime('now')),
            connected_at TEXT,
            last_seen TEXT,
            connection_state TEXT DEFAULT 'disconnected',
            total_number_of_users INTEGER DEFAULT 0,
            total_files_uploaded INTEGER DEFAULT 0
        )`, (err) => {
            if (err) {
                console.error('Error creating dbt1_developer table:', err.message);
            } else {
                console.log('dbt1_developer table ready');

                // Insert default developer account if not exists
                db.run(`INSERT OR IGNORE INTO dbt1_developer (developer_name, app_email, app_token)
                        VALUES (?, ?, ?)`,
                        ['ocrify', 'modeblackmng@gmail.com', 'default_token_' + Date.now()],
                        (err) => {
                            if (err) console.error('Error inserting default developer:', err.message);
                        }
                );
            }
        });

        // dbt2 - User table
        db.run(`CREATE TABLE IF NOT EXISTS dbt2_user (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_queue_position TEXT NOT NULL UNIQUE,
            total_files_uploaded INTEGER DEFAULT 0,
            total_files_treated INTEGER DEFAULT 0,
            total_files_not_treated INTEGER DEFAULT 0,
            extraction_start_timestamp TEXT,
            extraction_end_timestamp TEXT,
            total_processing_time REAL DEFAULT 0
        )`, (err) => {
            if (err) {
                console.error('Error creating dbt2_user table:', err.message);
            } else {
                console.log('dbt2_user table ready');
            }
        });

        // dbt3 - File table
        db.run(`CREATE TABLE IF NOT EXISTS dbt3_file (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_name TEXT NOT NULL,
            user_queue_position TEXT NOT NULL,
            ai_file_name TEXT,
            file_type TEXT,
            output_file_type TEXT,
            detected_language TEXT,
            extraction_start_timestamp TEXT,
            extraction_end_timestamp TEXT,
            file_processing_time REAL,
            extraction_state TEXT DEFAULT 'pending',
            FOREIGN KEY (user_queue_position) REFERENCES dbt2_user(user_queue_position)
        )`, (err) => {
            if (err) {
                console.error('Error creating dbt3_file table:', err.message);
            } else {
                console.log('dbt3_file table ready');
            }
        });

        // dbt4 - Notification table
        db.run(`CREATE TABLE IF NOT EXISTS dbt4_notification (
            notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
            message TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            timestamp TEXT DEFAULT (datetime('now')),
            sender_email TEXT,
            receiver_email TEXT
        )`, (err) => {
            if (err) {
                console.error('Error creating dbt4_notification table:', err.message);
            } else {
                console.log('dbt4_notification table ready');
            }
        });
    });
}

// Database helper functions
const dbHelpers = {
    // Get next user queue position
    getNextUserPosition: (callback) => {
        db.get('SELECT COUNT(*) as count FROM dbt2_user', (err, row) => {
            if (err) {
                callback(err, null);
            } else {
                const nextPosition = 'user' + (row.count + 1);
                callback(null, nextPosition);
            }
        });
    },

    // Create new user
    createUser: (userPosition, callback) => {
        db.run(`INSERT INTO dbt2_user (user_queue_position) VALUES (?)`,
            [userPosition],
            function(err) {
                callback(err, this.lastID);
            }
        );
    },

    // Add file record
    addFile: (fileData, callback) => {
        const sql = `INSERT INTO dbt3_file
            (file_name, user_queue_position, ai_file_name, file_type, output_file_type,
            extraction_start_timestamp, extraction_state)
            VALUES (?, ?, ?, ?, ?, datetime('now'), 'processing')`;

        db.run(sql, [
            fileData.file_name,
            fileData.user_queue_position,
            fileData.ai_file_name,
            fileData.file_type,
            fileData.output_file_type
        ], function(err) {
            callback(err, this.lastID);
        });
    },

    // Update file after OCR processing
    updateFileAfterOCR: (fileId, detectedLanguage, state, callback) => {
        const sql = `UPDATE dbt3_file
            SET detected_language = ?,
                extraction_end_timestamp = datetime('now'),
                file_processing_time = (julianday(datetime('now')) - julianday(extraction_start_timestamp)) * 86400,
                extraction_state = ?
            WHERE id = ?`;

        db.run(sql, [detectedLanguage, state, fileId], callback);
    },

    // Update user statistics
    updateUserStats: (userPosition, callback) => {
        db.run(`UPDATE dbt2_user
            SET total_files_uploaded = total_files_uploaded + 1
            WHERE user_queue_position = ?`,
            [userPosition], callback);
    },

    // Update user extraction start
    updateUserExtractionStart: (userPosition, callback) => {
        db.run(`UPDATE dbt2_user
            SET extraction_start_timestamp = datetime('now')
            WHERE user_queue_position = ?`,
            [userPosition], callback);
    },

    // Update user extraction end and calculate total processing time
    updateUserExtractionEnd: (userPosition, success, callback) => {
        const sql = `UPDATE dbt2_user
            SET extraction_end_timestamp = datetime('now'),
                total_files_treated = total_files_treated + ?,
                total_files_not_treated = total_files_not_treated + ?
            WHERE user_queue_position = ?`;

        const treated = success ? 1 : 0;
        const notTreated = success ? 0 : 1;

        db.run(sql, [treated, notTreated, userPosition], (err) => {
            if (err) {
                if (callback) callback(err);
                return;
            }

            // Now calculate total_processing_time by summing all file processing times
            dbHelpers.updateUserTotalProcessingTime(userPosition, callback);
        });
    },

    // Update user extraction end for bulk uploads (with specific counts)
    updateUserExtractionEndBulk: (userPosition, successCount, failCount, callback) => {
        const sql = `UPDATE dbt2_user
            SET extraction_end_timestamp = datetime('now'),
                total_files_treated = total_files_treated + ?,
                total_files_not_treated = total_files_not_treated + ?
            WHERE user_queue_position = ?`;

        db.run(sql, [successCount, failCount, userPosition], (err) => {
            if (err) {
                if (callback) callback(err);
                return;
            }

            // Now calculate total_processing_time by summing all file processing times
            dbHelpers.updateUserTotalProcessingTime(userPosition, callback);
        });
    },

    // Calculate and update total processing time from all files
    updateUserTotalProcessingTime: (userPosition, callback) => {
        const sumSql = `SELECT COALESCE(SUM(file_processing_time), 0) as total
                        FROM dbt3_file
                        WHERE user_queue_position = ? AND extraction_state = 'success'`;

        db.get(sumSql, [userPosition], (err, row) => {
            if (err) {
                if (callback) callback(err);
                return;
            }

            const updateSql = `UPDATE dbt2_user
                              SET total_processing_time = ?
                              WHERE user_queue_position = ?`;

            db.run(updateSql, [row.total, userPosition], callback);
        });
    },

    // Increment developer file count
    incrementFileCount: (callback) => {
        db.run(`UPDATE dbt1_developer
            SET total_files_uploaded = total_files_uploaded + 1
            WHERE app_email = 'modeblackmng@gmail.com'`,
            callback);
    },

    // Increment total number of users
    incrementUserCount: (callback) => {
        db.run(`UPDATE dbt1_developer
            SET total_number_of_users = total_number_of_users + 1
            WHERE app_email = 'modeblackmng@gmail.com'`,
            callback);
    },

    // Add notification
    addNotification: (message, senderEmail, receiverEmail, callback) => {
        db.run(`INSERT INTO dbt4_notification (message, sender_email, receiver_email)
            VALUES (?, ?, ?)`,
            [message, senderEmail, receiverEmail],
            function(err) {
                callback(err, this.lastID);
            }
        );
    },

    // Get user files
    getUserFiles: (userPosition, callback) => {
        db.all(`SELECT * FROM dbt3_file WHERE user_queue_position = ? ORDER BY id DESC`,
            [userPosition],
            callback
        );
    }
};

module.exports = { db, dbHelpers };
