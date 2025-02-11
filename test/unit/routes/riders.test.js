const express = require('express');
const request = require('supertest');
const createRiderRouter = require('../../../src/routes/riders');

describe('Riders Routes', () => {
    let app, mockDb;

    beforeEach(() => {
        app = express();
        app.use(express.urlencoded({ extended: true }));
        app.use((req, res, next) => { req.isAuthenticated = () => true; next(); });
        
        mockDb = {
            get: jest.fn((q, p, cb) => cb(null, { id: 1, name: 'Test Trip' })),
            run: jest.fn((q, p, cb) => cb(null)),
            all: jest.fn((q, p, cb) => cb(null, [])),
            serialize: jest.fn((cb) => cb())
        };

        const riderRouter = createRiderRouter(mockDb);
        app.use('/riders', riderRouter);

        app.use(express.static('public'));
        app.set('view engine', 'pug');
    });

    it('should handle GET /riders/add', async () => {
        mockDb.get.mockImplementation((q, p, cb) => cb(null, {
            id: 1, name: 'Active Trip'
        }));

        const response = await request(app).get('/riders/add');
        expect(response.status).toBe(200);
    });

    it('should handle POST /riders/add', async () => {
        const response = await request(app)
            .post('/riders/add')
            .send({
                name: 'New Rider',
                email: 'test@test.com',
                phone: '1234567890',
                seats: '2'
            });
        expect(response.status).toBe(302); // Redirect after creation
    });

    it('should handle GET /riders/:id/edit', async () => {
        const response = await request(app).get('/riders/1/edit');
        expect(response.status).toBe(200);
    });

    it('should handle POST /riders/:id/edit', async () => {
        const response = await request(app)
            .post('/riders/1/edit')
            .send({
                name: 'Updated Rider',
                email: 'test@test.com',
                phone: '1234567890',
                seats: '2'
            });
        expect(response.status).toBe(302); // Redirect after update
    });

    it('should handle GET /riders/:id/payments', async () => {
        mockDb.all.mockImplementation((q, p, cb) => cb(null, [
            { id: 1, amount: 100, date: '2024-02-12' }
        ]));

        const response = await request(app).get('/riders/1/payments');
        expect(response.status).toBe(200);
    });
});
