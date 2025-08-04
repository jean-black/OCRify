const bcrypt = require('bcrypt');
const { Pool } = require('pg');

async function addTestUser() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        // Create tables first
        await pool.query(`
            CREATE TABLE IF NOT EXISTS dbt1 (
                id SERIAL PRIMARY KEY,
                farmer_id VARCHAR(255) UNIQUE,
                token VARCHAR(255),
                password VARCHAR(255),
                timestamp TIMESTAMP DEFAULT NOW()
            );
        `);

        // Create test user
        const email = 'test@safezone.com';
        const password = 'safezone123456'; // 10+ characters
        const hashedPassword = await bcrypt.hash(password, 10);
        const token = Math.random().toString(36).substring(2) + Date.now().toString(36);

        await pool.query(
            'INSERT INTO dbt1 (farmer_id, token, password, timestamp) VALUES ($1, $2, $3, NOW()) ON CONFLICT (farmer_id) DO NOTHING',
            [email, token, hashedPassword]
        );

        console.log('✅ Test user created successfully!');
        console.log('📧 Email: test@safezone.com');
        console.log('🔐 Password: safezone123456');
        
    } catch (error) {
        console.error('❌ Error creating test user:', error);
    } finally {
        await pool.end();
    }
}

addTestUser();