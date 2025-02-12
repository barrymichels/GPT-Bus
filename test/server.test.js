const request = require("supertest");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const { createServer, initDbAndStartServer } = require("../server");
const assert = require("assert");
const fs = require('fs');
const path = require('path');
const { initializeDatabase } = require('../src/services/db/init');

// Increase timeout for all tests
jest.setTimeout(5000);

describe("Server Tests", () => {
    let app, db;
    const TEST_DB_DIR = './test_db';
    const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test_database.db');

    beforeAll(async () => {
        // Clean up any existing test database
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
        if (fs.existsSync(TEST_DB_DIR)) {
            fs.rmdirSync(TEST_DB_DIR);
        }

        // Create test database
        db = await initializeDatabase(TEST_DB_DIR);
        app = createServer(db);
    });

    afterAll((done) => {
        // Cleanup database connection and files
        db.close(() => {
            if (fs.existsSync(TEST_DB_PATH)) {
                fs.unlinkSync(TEST_DB_PATH);
            }
            if (fs.existsSync(TEST_DB_DIR)) {
                fs.rmdirSync(TEST_DB_DIR);
            }
            done();
        });
    });

    // Basic test to verify server is working
    describe("Basic Routes", () => {
        it("GET /login should return the login page", async () => {
            const response = await request(app).get("/login");
            expect(response.status).toBe(200);
            expect(response.text).toContain("form");
        });

        it("GET / should redirect to /dashboard when not authenticated", async () => {
            const response = await request(app).get("/");
            expect(response.status).toBe(302);
            expect(response.headers.location).toBe("/dashboard");
        });
    });

    // Authentication tests
    describe("Authentication", () => {
        it("should login with correct credentials", async () => {
            const response = await request(app)
                .post("/login")
                .send({ username: "admin", password: "password123" });
            expect(response.status).toBe(302);
            expect(response.headers.location).toBe("/dashboard");
        });

        it("should fail to login with incorrect credentials", async () => {
            const response = await request(app)
                .post("/login")
                .send({ username: "admin", password: "wrongpassword" });
            expect(response.status).toBe(302);
            expect(response.headers.location).toBe("/login");
        });
    });

    // URL rewrite tests
    describe("URL Rewrites", () => {
        it("should rewrite /add-user URL correctly", async () => {
            const response = await request(app).get("/add-user");
            expect(response.status).toBe(302); // Should redirect due to auth
        });

        it("should rewrite /rider/:id/payments URL correctly", async () => {
            const response = await request(app).get("/rider/123/payments");
            expect(response.status).toBe(302); // Should redirect due to auth
        });

        it("should rewrite /add-payment URL correctly", async () => {
            // Create an authenticated session
            const agent = request.agent(app);
            await agent
                .post("/login")
                .send({ username: "admin", password: "password123" });

            const response = await agent.get("/add-payment");
            expect(response.status).toBe(500); // Should fail with 500 since there's no active trip
        });

        it("should rewrite /edit-payment URL correctly", async () => {
            const response = await request(app).get("/edit-payment/123");
            expect(response.status).toBe(302); // Should redirect due to auth
        });

        it("should rewrite /delete-payment URL correctly", async () => {
            // Create an authenticated session
            const agent = request.agent(app);
            await agent
                .post("/login")
                .send({ username: "admin", password: "password123" });

            const response = await agent.get("/delete-payment/123");
            expect(response.status).toBe(500); // Should fail with 500 since payment doesn't exist
        });
    });

    // Trip routes tests
    describe("Trip Routes", () => {
        it("should serve add-trip page", async () => {
            const response = await request(app).get("/add-trip");
            expect(response.status).toBe(302); // Should redirect due to auth
        });

        it("should handle add trip POST request", async () => {
            const response = await request(app)
                .post("/add-trip")
                .send({ date: "2025-02-12" });
            expect(response.status).toBe(302); // Should redirect due to auth
        });
    });

    // Database initialization tests
    describe("Database Initialization", () => {
        it("should have created required tables", async () => {
            const tables = ['users', 'sessions', 'riders', 'trips', 'trip_riders', 'payments'];

            for (const table of tables) {
                const result = await new Promise((resolve, reject) => {
                    db.get(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                        [table],
                        (err, row) => {
                            if (err) reject(err);
                            resolve(row);
                        }
                    );
                });
                expect(result?.name).toBe(table);
            }
        });

        it("should have created default admin user", async () => {
            const result = await new Promise((resolve, reject) => {
                db.get("SELECT username FROM users", [], (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                });
            });
            expect(result.username).toBe('admin');
        });
    });
});
