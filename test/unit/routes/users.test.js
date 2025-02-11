const express = require('express');
const request = require('supertest');
const bcrypt = require('bcrypt');
const createUserRouter = require('../../../src/routes/users');

// Mock bcrypt with argument logging
jest.mock('bcrypt', () => ({
    hash: jest.fn().mockImplementation((password, salt, cb) => {
        // Call the callback with our mock hashed password
        cb(null, 'hashed_password');
    })
}));

describe('Users Routes', () => {
    let app, mockDb;

    beforeEach(() => {
        jest.clearAllMocks();

        app = express();
        // Explicitly configure body parsing
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));

        // Mock authenticated user
        app.use((req, res, next) => {
            req.isAuthenticated = () => true;
            req.user = { id: 1, username: 'testuser' };
            next();
        });

        // Mock rendering
        app.use((req, res, next) => {
            res.render = function(view, locals) {
                res.status(200).json({ view, locals });
            };
            next();
        });

        mockDb = {
            get: jest.fn((q, p, cb) => cb(null, { id: 1, username: 'testuser' })),
            run: jest.fn((q, p, cb) => cb(null)),
            all: jest.fn((q, p, cb) => cb(null, [])),
        };

        const userRouter = createUserRouter(mockDb);
        app.use('/', userRouter);
    });

    it('should handle GET / (change password form)', async () => {
        const response = await request(app).get('/');
        expect(response.status).toBe(200);
        expect(response.body.view).toBe('change-password');
    });

    it('should handle POST / (change password)', async () => {
        const response = await request(app)
            .post('/')
            .send({ newPassword: 'newpass123' });

        expect(bcrypt.hash).toHaveBeenCalledWith('newpass123', 10, expect.any(Function));
        expect(mockDb.run).toHaveBeenCalledWith(
            'UPDATE users SET password = ? WHERE id = ?',
            ['hashed_password', 1],
            expect.any(Function)
        );
        expect(response.status).toBe(302);
        expect(response.header.location).toBe('/dashboard');
    });

    it('should handle GET /add (add user form)', async () => {
        const response = await request(app).get('/add');
        expect(response.status).toBe(200);
        expect(response.body.view).toBe('add-user');
    });

    it('should handle POST /add (create user)', async () => {
        const response = await request(app)
            .post('/add')
            .send({ username: 'newuser', password: 'pass123' });

        expect(bcrypt.hash).toHaveBeenCalledWith('pass123', 10, expect.any(Function));
        expect(mockDb.run).toHaveBeenCalledWith(
            'INSERT INTO users (username, password) VALUES (?, ?)',
            ['newuser', 'hashed_password'],
            expect.any(Function)
        );
        expect(response.status).toBe(302);
        expect(response.header.location).toBe('/dashboard');
    });

    it('should handle database errors in password change', async () => {
        mockDb.run.mockImplementationOnce((q, p, cb) => cb(new Error('DB Error')));

        try {
            await request(app)
                .post('/')
                .send({ newPassword: 'newpass123' });
        } catch (err) {
            expect(err.message).toBe('DB Error');
        }
    });

    it('should handle database errors in user creation', async () => {
        mockDb.run.mockImplementationOnce((q, p, cb) => cb(new Error('DB Error')));

        try {
            await request(app)
                .post('/add')
                .send({ username: 'newuser', password: 'pass123' });
        } catch (err) {
            expect(err.message).toBe('DB Error');
        }
    });
});
