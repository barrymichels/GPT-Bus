const { configurePassport, isAuthenticated } = require('../../../src/middleware/auth');
const passport = require('passport');
const bcrypt = require('bcrypt');

describe('Authentication Middleware', () => {
    let mockDb;

    beforeEach(() => {
        // Mock database
        mockDb = {
            get: jest.fn()
        };

        // Configure passport with mocked db
        configurePassport(mockDb);
    });

    describe('Local Strategy', () => {
        it('should authenticate valid credentials', (done) => {
            const username = 'testuser';
            const password = 'password123';
            const hashedPassword = bcrypt.hashSync(password, 1);

            mockDb.get.mockImplementation((query, params, callback) => {
                callback(null, {
                    id: 1,
                    username,
                    password: hashedPassword
                });
            });

            const strategy = passport._strategies['local'];
            strategy._verify(username, password, (err, user) => {
                expect(err).toBeNull();
                expect(user).toBeDefined();
                expect(user.username).toBe(username);
                done();
            });
        });

        it('should reject invalid credentials', (done) => {
            const username = 'testuser';
            const password = 'wrongpassword';
            const hashedPassword = bcrypt.hashSync('password123', 1);

            mockDb.get.mockImplementation((query, params, callback) => {
                callback(null, {
                    id: 1,
                    username,
                    password: hashedPassword
                });
            });

            const strategy = passport._strategies['local'];
            strategy._verify(username, password, (err, user) => {
                expect(err).toBeNull();
                expect(user).toBeFalsy();
                done();
            });
        });

        it('should handle database errors', (done) => {
            const username = 'testuser';
            const password = 'password123';

            mockDb.get.mockImplementation((query, params, callback) => {
                callback(new Error('Database error'));
            });

            const strategy = passport._strategies['local'];
            strategy._verify(username, password, (err, user) => {
                expect(err).toBeDefined();
                expect(user).toBeUndefined();
                done();
            });
        });
    });

    describe('isAuthenticated Middleware', () => {
        it('should allow authenticated requests', () => {
            const req = { isAuthenticated: () => true };
            const res = { redirect: jest.fn() };
            const next = jest.fn();

            isAuthenticated(req, res, next);
            expect(next).toHaveBeenCalled();
            expect(res.redirect).not.toHaveBeenCalled();
        });

        it('should redirect unauthenticated requests', () => {
            const req = { isAuthenticated: () => false };
            const res = { redirect: jest.fn() };
            const next = jest.fn();

            isAuthenticated(req, res, next);
            expect(res.redirect).toHaveBeenCalledWith('/login');
            expect(next).not.toHaveBeenCalled();
        });
    });
});
