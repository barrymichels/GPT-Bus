const sqlite3 = require('sqlite3');
const { initializeDatabase } = require('../../../src/services/db/init');

describe('Database Service', () => {
    let db;

    beforeEach(async () => {
        db = await initializeDatabase();
    });

    afterEach((done) => {
        db.close(done);
    });

    test('should initialize database with required tables', (done) => {
        const requiredTables = [
            'users',
            'sessions',
            'riders',
            'trips',
            'trip_riders',
            'payments'
        ];

        const checkTable = (tableName) => {
            return new Promise((resolve, reject) => {
                db.get(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                    [tableName],
                    (err, row) => {
                        if (err) reject(err);
                        resolve(row);
                    }
                );
            });
        };

        Promise.all(requiredTables.map(table => checkTable(table)))
            .then(results => {
                results.forEach((result, index) => {
                    expect(result.name).toBe(requiredTables[index]);
                });
                done();
            })
            .catch(err => done(err));
    });

    test('should create default admin user', (done) => {
        db.get("SELECT username FROM users WHERE username = 'admin'", [], (err, row) => {
            expect(err).toBeNull();
            expect(row.username).toBe('admin');
            done();
        });
    });

    test('should enable foreign key constraints', (done) => {
        db.get("PRAGMA foreign_keys", [], (err, row) => {
            expect(err).toBeNull();
            expect(row.foreign_keys).toBe(1);
            done();
        });
    });
});
