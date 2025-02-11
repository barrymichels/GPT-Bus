// Load environment variables if not already loaded
require('dotenv').config();

module.exports = {
    // Email configuration
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASS: process.env.EMAIL_PASS,

    // Server configuration
    PORT: process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    
    // Session configuration
    SESSION_SECRET: process.env.SESSION_SECRET || 'my secret',

    // Database configuration
    DB_PATH: process.env.DB_PATH || './db/database.db'
};
