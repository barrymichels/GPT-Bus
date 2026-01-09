const path = require('path');
const fs = require('fs');

// Test environment configuration
process.env.NODE_ENV = 'test';
process.env.TEST_DB_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-secret';

// Ensure test directories exist
const TEST_DIRS = ['./test/temp', './test/fixtures'];
TEST_DIRS.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Global test timeout
jest.setTimeout(10000);

// Mock email service for tests
jest.mock('../src/services/email', () => ({
    sendPaymentEmail: jest.fn().mockResolvedValue(true),
    formatCurrency: jest.fn(amount => `$${amount}.00`)
}));

// Clean up function for after tests
afterAll(async () => {
    TEST_DIRS.forEach(dir => {
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true });
        }
    });
});
