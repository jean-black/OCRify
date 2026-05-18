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
        // dbt1 - Accounts table (registered users)
        db.run(`CREATE TABLE IF NOT EXISTS dbt1_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )`, (err) => {
            if (err) {
                console.error('Error creating dbt1_accounts table:', err.message);
            } else {
                console.log('dbt1_accounts table ready');
            }
        });

        // dbt5 - Password reset codes
        db.run(`CREATE TABLE IF NOT EXISTS dbt5_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            token TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            used INTEGER DEFAULT 0
        )`, (err) => {
            if (err) {
                console.error('Error creating dbt5_reset_tokens table:', err.message);
            } else {
                console.log('dbt5_reset_tokens table ready');
            }
        });

        // dbt2 - User table
        db.run(`CREATE TABLE IF NOT EXISTS dbt2_user (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_queue_position TEXT NOT NULL UNIQUE,
            account_id INTEGER,
            total_files_uploaded INTEGER DEFAULT 0,
            total_files_treated INTEGER DEFAULT 0,
            total_files_not_treated INTEGER DEFAULT 0,
            extraction_start_timestamp TEXT,
            extraction_end_timestamp TEXT,
            total_processing_time REAL DEFAULT 0,
            FOREIGN KEY (account_id) REFERENCES dbt1_accounts(id)
        )`, (err) => {
            if (err) {
                console.error('Error creating dbt2_user table:', err.message);
            } else {
                console.log('dbt2_user table ready');
            }
        });
        // Add account_id to existing databases that predate this column
        db.run(`ALTER TABLE dbt2_user ADD COLUMN account_id INTEGER REFERENCES dbt1_accounts(id)`, () => {});

        // dbt3 - File table
        db.run(`CREATE TABLE IF NOT EXISTS dbt3_file (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_name TEXT NOT NULL,
            user_queue_position TEXT NOT NULL,
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

        // dbt6 - Developer table
        db.run(`CREATE TABLE IF NOT EXISTS dbt6_developer (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            developer_name       TEXT NOT NULL,
            app_email            TEXT NOT NULL UNIQUE,
            app_token            TEXT,
            account_created_at   TEXT DEFAULT (datetime('now')),
            connected_at         TEXT,
            last_seen            TEXT,
            connection_state     TEXT DEFAULT 'disconnected',
            total_number_of_users    INTEGER DEFAULT 0,
            total_files_uploaded     INTEGER DEFAULT 0
        )`, (err) => {
            if (err) {
                console.error('Error creating dbt6_developer table:', err.message);
            } else {
                console.log('dbt6_developer table ready');
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
        // dbt7 - Friendships table
        db.run(`CREATE TABLE IF NOT EXISTS dbt7_friendships (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            requester_id INTEGER NOT NULL,
            addressee_id INTEGER NOT NULL,
            status       TEXT    NOT NULL DEFAULT 'pending',
            created_at   TEXT    DEFAULT (datetime('now')),
            UNIQUE (requester_id, addressee_id),
            FOREIGN KEY (requester_id) REFERENCES dbt1_accounts(id),
            FOREIGN KEY (addressee_id) REFERENCES dbt1_accounts(id)
        )`, (err) => {
            if (err) {
                console.error('Error creating dbt7_friendships table:', err.message);
            } else {
                console.log('dbt7_friendships table ready');
            }
        });

        // dbt8 - Messages table
        db.run(`CREATE TABLE IF NOT EXISTS dbt8_messages (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id          INTEGER NOT NULL,
            receiver_id        INTEGER NOT NULL,
            subject            TEXT,
            body               TEXT,
            attached_file_id   INTEGER,
            attached_file_name TEXT,
            attachment_path    TEXT,
            starred_sender     INTEGER DEFAULT 0,
            starred_receiver   INTEGER DEFAULT 0,
            read               INTEGER DEFAULT 0,
            deleted_sender     INTEGER DEFAULT 0,
            deleted_receiver   INTEGER DEFAULT 0,
            created_at         TEXT    DEFAULT (datetime('now')),
            FOREIGN KEY (sender_id)        REFERENCES dbt1_accounts(id),
            FOREIGN KEY (receiver_id)      REFERENCES dbt1_accounts(id),
            FOREIGN KEY (attached_file_id) REFERENCES dbt3_file(id)
        )`, (err) => {
            if (err) {
                console.error('Error creating dbt8_messages table:', err.message);
            } else {
                console.log('dbt8_messages table ready');
            }
        });
        // Add attachment_path to existing databases that predate this column
        db.run(`ALTER TABLE dbt8_messages ADD COLUMN attachment_path TEXT`, () => {});

        // dbt9 - Groups
        db.run(`CREATE TABLE IF NOT EXISTS dbt9_groups (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT,
            creator_id INTEGER REFERENCES dbt1_accounts(id),
            created_at TEXT DEFAULT (datetime('now'))
        )`, (err) => {
            if (err) console.error('dbt9_groups:', err.message);
            else console.log('dbt9_groups table ready');
        });

        // dbt10 - Group members
        db.run(`CREATE TABLE IF NOT EXISTS dbt10_group_members (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id  INTEGER REFERENCES dbt9_groups(id),
            user_id   INTEGER REFERENCES dbt1_accounts(id),
            joined_at TEXT DEFAULT (datetime('now')),
            UNIQUE(group_id, user_id)
        )`, (err) => {
            if (err) console.error('dbt10_group_members:', err.message);
            else console.log('dbt10_group_members table ready');
        });

        // dbt11 - Group messages
        db.run(`CREATE TABLE IF NOT EXISTS dbt11_group_messages (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id           INTEGER REFERENCES dbt9_groups(id),
            sender_id          INTEGER REFERENCES dbt1_accounts(id),
            body               TEXT,
            attached_file_id   INTEGER,
            attached_file_name TEXT,
            attachment_path    TEXT,
            created_at         TEXT DEFAULT (datetime('now'))
        )`, (err) => {
            if (err) console.error('dbt11_group_messages:', err.message);
            else console.log('dbt11_group_messages table ready');
        });

        // dbt12 - Per-member read cursor for groups
        db.run(`CREATE TABLE IF NOT EXISTS dbt12_group_reads (
            group_id     INTEGER,
            user_id      INTEGER,
            last_read_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (group_id, user_id)
        )`, (err) => {
            if (err) console.error('dbt12_group_reads:', err.message);
            else console.log('dbt12_group_reads table ready');
        });
    });
}

// Database helper functions
const dbHelpers = {
    // Create a new account
    createAccount: (username, email, passwordHash, callback) => {
        db.run(`INSERT INTO dbt1_accounts (username, email, password_hash) VALUES (?, ?, ?)`,
            [username, email, passwordHash],
            function(err) {
                callback(err, this.lastID);
            }
        );
    },

    // Find account by email
    findAccountByEmail: (email, callback) => {
        db.get(`SELECT * FROM dbt1_accounts WHERE email = ?`, [email], callback);
    },

    // Update account password
    updatePassword: (email, passwordHash, callback) => {
        db.run(`UPDATE dbt1_accounts SET password_hash = ? WHERE email = ?`,
            [passwordHash, email], callback);
    },

    // Save a reset token
    saveResetToken: (email, token, callback) => {
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        db.run(`DELETE FROM dbt5_reset_tokens WHERE email = ?`, [email], () => {
            db.run(`INSERT INTO dbt5_reset_tokens (email, token, expires_at) VALUES (?, ?, ?)`,
                [email, token, expiresAt], callback);
        });
    },

    // Find a valid (unused, unexpired) reset token
    findResetToken: (email, token, callback) => {
        db.get(`SELECT * FROM dbt5_reset_tokens
                WHERE email = ? AND token = ? AND used = 0
                AND expires_at > datetime('now')`,
            [email, token], callback);
    },

    // Mark reset token as used
    markTokenUsed: (id, callback) => {
        db.run(`UPDATE dbt5_reset_tokens SET used = 1 WHERE id = ?`, [id], callback);
    },

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

    // Create new user (accountId optional — links the position to a registered account)
    createUser: (userPosition, accountId, callback) => {
        if (typeof accountId === 'function') { callback = accountId; accountId = null; }
        db.run(`INSERT INTO dbt2_user (user_queue_position, account_id) VALUES (?, ?)`,
            [userPosition, accountId || null],
            function(err) { callback(err, this.lastID); }
        );
    },

    // Find existing user_queue_position for a registered account
    getUserPositionByAccountId: (accountId, callback) => {
        db.get(`SELECT user_queue_position FROM dbt2_user WHERE account_id = ?`,
            [accountId], callback);
    },

    // Add file record
    addFile: (fileData, callback) => {
        const sql = `INSERT INTO dbt3_file
            (file_name, user_queue_position, file_type, output_file_type,
            extraction_start_timestamp, extraction_state)
            VALUES (?, ?, ?, ?, datetime('now'), 'processing')`;

        db.run(sql, [
            fileData.file_name,
            fileData.user_queue_position,
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
    },

    // Get a single file by id + position (ownership check)
    getFileById: (fileId, userPosition, callback) => {
        db.get(`SELECT * FROM dbt3_file WHERE id = ? AND user_queue_position = ?`,
            [fileId, userPosition], callback);
    },

    // Save output filename after OCR
    saveOutputFileName: (fileId, outputFileName, callback) => {
        db.run(`UPDATE dbt3_file SET output_file_name = ? WHERE id = ?`,
            [outputFileName, fileId], callback || (() => {}));
    },

    // ── Messages ────────────────────────────────────────────────────────────

    sendMessage: (senderId, receiverId, subject, body, attachedFileId, attachedFileName, attachmentPath, callback) => {
        // Support legacy callers that pass callback as 7th argument (no attachmentPath)
        if (typeof attachmentPath === 'function') {
            callback = attachmentPath;
            attachmentPath = null;
        }
        db.run(`INSERT INTO dbt8_messages
                (sender_id, receiver_id, subject, body, attached_file_id, attached_file_name, attachment_path)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [senderId, receiverId, subject || '(no subject)', body,
             attachedFileId || null, attachedFileName || null, attachmentPath || null],
            function(err) { callback(err, this.lastID); }
        );
    },

    getInbox: (userId, callback) => {
        db.all(`SELECT m.*, s.username AS sender_name, s.email AS sender_email
                FROM dbt8_messages m
                JOIN dbt1_accounts s ON m.sender_id = s.id
                WHERE m.receiver_id = ? AND m.deleted_receiver = 0
                ORDER BY m.created_at DESC`, [userId], callback);
    },

    getSent: (userId, callback) => {
        db.all(`SELECT m.*, r.username AS receiver_name, r.email AS receiver_email
                FROM dbt8_messages m
                JOIN dbt1_accounts r ON m.receiver_id = r.id
                WHERE m.sender_id = ? AND m.deleted_sender = 0
                ORDER BY m.created_at DESC`, [userId], callback);
    },

    getStarred: (userId, callback) => {
        db.all(`SELECT m.*,
                       s.username AS sender_name,   s.email AS sender_email,
                       r.username AS receiver_name, r.email AS receiver_email
                FROM dbt8_messages m
                JOIN dbt1_accounts s ON m.sender_id   = s.id
                JOIN dbt1_accounts r ON m.receiver_id = r.id
                WHERE (m.receiver_id = ? AND m.starred_receiver = 1 AND m.deleted_receiver = 0)
                   OR (m.sender_id   = ? AND m.starred_sender   = 1 AND m.deleted_sender   = 0)
                ORDER BY m.created_at DESC`, [userId, userId], callback);
    },

    getTrash: (userId, callback) => {
        db.all(`SELECT m.*,
                       s.username AS sender_name,   s.email AS sender_email,
                       r.username AS receiver_name, r.email AS receiver_email
                FROM dbt8_messages m
                JOIN dbt1_accounts s ON m.sender_id   = s.id
                JOIN dbt1_accounts r ON m.receiver_id = r.id
                WHERE (m.receiver_id = ? AND m.deleted_receiver = 1)
                   OR (m.sender_id   = ? AND m.deleted_sender   = 1)
                ORDER BY m.created_at DESC`, [userId, userId], callback);
    },

    getMessage: (msgId, userId, callback) => {
        db.get(`SELECT m.*,
                       s.username AS sender_name,   s.email AS sender_email,
                       r.username AS receiver_name, r.email AS receiver_email,
                       f.user_queue_position AS file_user_position
                FROM dbt8_messages m
                JOIN dbt1_accounts s ON m.sender_id   = s.id
                JOIN dbt1_accounts r ON m.receiver_id = r.id
                LEFT JOIN dbt3_file f ON m.attached_file_id = f.id
                WHERE m.id = ? AND (m.sender_id = ? OR m.receiver_id = ?)`,
            [msgId, userId, userId], callback);
    },

    markRead: (msgId, userId, callback) => {
        db.run(`UPDATE dbt8_messages SET read = 1 WHERE id = ? AND receiver_id = ?`,
            [msgId, userId], callback || (() => {}));
    },

    toggleStar: (msgId, userId, callback) => {
        db.run(`UPDATE dbt8_messages
                SET starred_receiver = 1 - starred_receiver
                WHERE id = ? AND receiver_id = ?`, [msgId, userId], function(err) {
            if (!err && this.changes > 0) return callback(null);
            db.run(`UPDATE dbt8_messages
                    SET starred_sender = 1 - starred_sender
                    WHERE id = ? AND sender_id = ?`, [msgId, userId], callback);
        });
    },

    trashMessage: (msgId, userId, callback) => {
        db.run(`UPDATE dbt8_messages SET deleted_receiver = 1
                WHERE id = ? AND receiver_id = ?`, [msgId, userId], function(err) {
            if (!err && this.changes > 0) return callback(null);
            db.run(`UPDATE dbt8_messages SET deleted_sender = 1
                    WHERE id = ? AND sender_id = ?`, [msgId, userId], callback);
        });
    },

    restoreMessage: (msgId, userId, callback) => {
        db.run(`UPDATE dbt8_messages
                SET deleted_receiver = 0, deleted_sender = 0
                WHERE id = ? AND (sender_id = ? OR receiver_id = ?)`,
            [msgId, userId, userId], callback);
    },

    deleteMessagePermanent: (msgId, userId, callback) => {
        db.run(`DELETE FROM dbt8_messages
                WHERE id = ? AND (sender_id = ? OR receiver_id = ?)`,
            [msgId, userId, userId], callback);
    },

    getUnreadCount: (userId, callback) => {
        db.get(`SELECT COUNT(*) AS count FROM dbt8_messages
                WHERE receiver_id = ? AND read = 0 AND deleted_receiver = 0`,
            [userId], callback);
    },

    searchMessages: (userId, query, callback) => {
        const like = `%${query}%`;
        db.all(`SELECT m.*, s.username AS sender_name, s.email AS sender_email,
                       r.username AS receiver_name, r.email AS receiver_email
                FROM dbt8_messages m
                JOIN dbt1_accounts s ON m.sender_id   = s.id
                JOIN dbt1_accounts r ON m.receiver_id = r.id
                WHERE (m.sender_id = ? OR m.receiver_id = ?)
                  AND (m.subject LIKE ? OR m.body LIKE ?
                       OR s.username LIKE ? OR r.username LIKE ?)
                ORDER BY m.created_at DESC LIMIT 50`,
            [userId, userId, like, like, like, like], callback);
    },

    // ── Friends ─────────────────────────────────────────────────────────────

    getFriends: (userId, callback) => {
        db.all(`SELECT f.id AS friendship_id, a.id AS friend_id,
                       a.username AS friend_name, a.email AS friend_email
                FROM dbt7_friendships f
                JOIN dbt1_accounts a ON f.addressee_id = a.id
                WHERE f.requester_id = ? AND f.status = 'accepted'
                UNION
                SELECT f.id AS friendship_id, a.id AS friend_id,
                       a.username AS friend_name, a.email AS friend_email
                FROM dbt7_friendships f
                JOIN dbt1_accounts a ON f.requester_id = a.id
                WHERE f.addressee_id = ? AND f.status = 'accepted'`,
            [userId, userId], callback);
    },

    getPendingRequests: (userId, callback) => {
        db.all(`SELECT f.id, a.username AS requester_name, a.email AS requester_email, f.created_at
                FROM dbt7_friendships f
                JOIN dbt1_accounts a ON f.requester_id = a.id
                WHERE f.addressee_id = ? AND f.status = 'pending'
                ORDER BY f.created_at DESC`, [userId], callback);
    },

    sendFriendRequest: (requesterId, addresseeId, callback) => {
        db.get(`SELECT id FROM dbt7_friendships
                WHERE (requester_id = ? AND addressee_id = ?)
                   OR (requester_id = ? AND addressee_id = ?)`,
            [requesterId, addresseeId, addresseeId, requesterId], (err, row) => {
                if (row) return callback(new Error('Friend request already exists'));
                db.run(`INSERT INTO dbt7_friendships (requester_id, addressee_id)
                        VALUES (?, ?)`, [requesterId, addresseeId],
                    function(err) { callback(err, this.lastID); });
            });
    },

    respondFriendRequest: (friendshipId, addresseeId, status, callback) => {
        db.run(`UPDATE dbt7_friendships SET status = ?
                WHERE id = ? AND addressee_id = ?`,
            [status, friendshipId, addresseeId], callback);
    },

    searchUsers: (query, excludeId, callback) => {
        const like = `%${query}%`;
        db.all(`SELECT id, username, email FROM dbt1_accounts
                WHERE (username LIKE ? OR email LIKE ?) AND id != ?
                LIMIT 8`, [like, like, excludeId], callback);
    },

    findAccountByUsername: (username, callback) => {
        db.get(`SELECT id, username, email FROM dbt1_accounts WHERE username = ?`,
            [username], callback);
    },

    getConversationThread: (userId, otherId, callback) => {
        db.all(`SELECT m.*,
                       s.username AS sender_name,   s.email AS sender_email,
                       r.username AS receiver_name, r.email AS receiver_email,
                       f.user_queue_position AS file_user_position
                FROM dbt8_messages m
                JOIN dbt1_accounts s ON m.sender_id   = s.id
                JOIN dbt1_accounts r ON m.receiver_id = r.id
                LEFT JOIN dbt3_file f ON m.attached_file_id = f.id
                WHERE (
                    (m.sender_id = ? AND m.receiver_id = ? AND m.deleted_sender   = 0) OR
                    (m.sender_id = ? AND m.receiver_id = ? AND m.deleted_receiver = 0)
                )
                ORDER BY m.created_at ASC`,
            [userId, otherId, otherId, userId], callback);
    },

    markThreadRead: (userId, otherId, callback) => {
        db.run(`UPDATE dbt8_messages SET read = 1
                WHERE sender_id = ? AND receiver_id = ? AND read = 0`,
            [otherId, userId], callback || (() => {}));
    },

    // ── Groups ───────────────────────────────────────────────────────────────

    createGroup: (name, creatorId, memberIds, callback) => {
        db.run(`INSERT INTO dbt9_groups (name, creator_id) VALUES (?, ?)`,
            [name, creatorId],
            function(err) {
                if (err) return callback(err);
                const groupId    = this.lastID;
                const allMembers = [...new Set([creatorId, ...memberIds])];
                let pending = allMembers.length;
                let done    = false;
                allMembers.forEach(uid => {
                    db.run(`INSERT OR IGNORE INTO dbt10_group_members (group_id, user_id) VALUES (?, ?)`,
                        [groupId, uid],
                        (e) => {
                            if (done) return;
                            if (e) { done = true; return callback(e); }
                            if (--pending === 0) callback(null, groupId);
                        }
                    );
                });
            }
        );
    },

    isGroupMember: (groupId, userId, callback) => {
        db.get(`SELECT 1 FROM dbt10_group_members WHERE group_id = ? AND user_id = ?`,
            [groupId, userId], (err, row) => callback(err, !!row));
    },

    getGroup: (groupId, callback) => {
        db.get(`SELECT * FROM dbt9_groups WHERE id = ?`, [groupId], callback);
    },

    getGroupMembers: (groupId, callback) => {
        db.all(`SELECT a.id, a.username, a.email
                FROM dbt10_group_members m
                JOIN dbt1_accounts a ON a.id = m.user_id
                WHERE m.group_id = ?`, [groupId], callback);
    },

    getUserGroups: (userId, callback) => {
        db.all(`
            SELECT g.id, g.name, g.created_at,
                   last_msg.body        AS last_body,
                   last_msg.created_at  AS last_message_at,
                   last_sender.username AS last_sender_name,
                   (SELECT COUNT(*) FROM dbt11_group_messages gm2
                    WHERE gm2.group_id = g.id
                      AND gm2.created_at > COALESCE(
                          (SELECT last_read_at FROM dbt12_group_reads
                           WHERE group_id = g.id AND user_id = ?), '1970-01-01')
                      AND gm2.sender_id != ?) AS unread_count,
                   (SELECT GROUP_CONCAT(a2.username, ', ')
                    FROM dbt10_group_members m2
                    JOIN dbt1_accounts a2 ON a2.id = m2.user_id
                    WHERE m2.group_id = g.id AND m2.user_id != ?) AS other_names
            FROM dbt9_groups g
            JOIN dbt10_group_members m ON m.group_id = g.id AND m.user_id = ?
            LEFT JOIN dbt11_group_messages last_msg ON last_msg.id = (
                SELECT id FROM dbt11_group_messages
                WHERE group_id = g.id ORDER BY created_at DESC LIMIT 1
            )
            LEFT JOIN dbt1_accounts last_sender ON last_sender.id = last_msg.sender_id
            ORDER BY COALESCE(last_msg.created_at, g.created_at) DESC`,
            [userId, userId, userId, userId], callback);
    },

    getGroupMessages: (groupId, callback) => {
        db.all(`SELECT gm.*, a.username AS sender_name, a.email AS sender_email,
                       f.user_queue_position AS file_user_position
                FROM dbt11_group_messages gm
                JOIN dbt1_accounts a ON a.id = gm.sender_id
                LEFT JOIN dbt3_file f ON f.id = gm.attached_file_id
                WHERE gm.group_id = ?
                ORDER BY gm.created_at ASC`, [groupId], callback);
    },

    sendGroupMessage: (groupId, senderId, body, attachedFileId, attachedFileName, attachmentPath, callback) => {
        if (typeof attachmentPath === 'function') { callback = attachmentPath; attachmentPath = null; }
        db.run(`INSERT INTO dbt11_group_messages
                    (group_id, sender_id, body, attached_file_id, attached_file_name, attachment_path)
                VALUES (?, ?, ?, ?, ?, ?)`,
            [groupId, senderId, body, attachedFileId || null, attachedFileName || null, attachmentPath || null],
            function(err) { callback(err, this.lastID); }
        );
    },

    markGroupRead: (groupId, userId, callback) => {
        db.run(`INSERT INTO dbt12_group_reads (group_id, user_id, last_read_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(group_id, user_id) DO UPDATE SET last_read_at = datetime('now')`,
            [groupId, userId], callback || (() => {}));
    },

    getGroupUnreadTotal: (userId, callback) => {
        db.get(`SELECT COALESCE(SUM(
                    (SELECT COUNT(*) FROM dbt11_group_messages gm
                     WHERE gm.group_id = m.group_id
                       AND gm.created_at > COALESCE(
                           (SELECT last_read_at FROM dbt12_group_reads
                            WHERE group_id = m.group_id AND user_id = ?), '1970-01-01')
                       AND gm.sender_id != ?)
                ), 0) AS total
                FROM dbt10_group_members m WHERE m.user_id = ?`,
            [userId, userId, userId], callback);
    }
};

module.exports = { db, dbHelpers };
