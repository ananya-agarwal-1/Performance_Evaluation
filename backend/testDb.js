require('dotenv').config();
console.log('DB_USER:', JSON.stringify(process.env.DB_USER));
console.log('DB_PASSWORD:', JSON.stringify(process.env.DB_PASSWORD));
const pool = require('./db');

async function testConnection() {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS result');
    console.log('Database connected! Test query result:', rows[0].result);
  } catch (err) {
    console.error('Database connection failed:', err.message);
  }
}

testConnection();