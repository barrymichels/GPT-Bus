const express = require('express');
const request = require('supertest');
const path = require('path');
const createTripRouter = require('../../../src/routes/trips');

describe('Trips Routes', () => {
    let app, mockDb;

    beforeEach(() => {
        app = express();
        app.use(express.urlencoded({ extended: true }));

        // Setup view engine properly
        app.set('view engine', 'pug');
        app.set('views', path.join(__dirname, '../../../views'));

        // Mock rendering for tests
        app.use((req, res, next) => {
            res.render = function (view, locals) {
                res.status(200).json({ view, locals });
            };
            next();
        });

        // Bypass authentication
        app.use((req, res, next) => {
            req.isAuthenticated = () => true;
            next();
        });

        mockDb = {
            get: jest.fn((q, p, cb) => cb(null, { id: 1, name: 'Test Trip' })),
            run: jest.fn((q, p, cb) => cb(null)),
            all: jest.fn((q, p, cb) => cb(null, [])),
            serialize: jest.fn((cb) => cb())
        };

        const tripRouter = createTripRouter(mockDb);
        app.use('/', tripRouter); // Mount at root to avoid path issues

        // Error handling should be last
        app.use((err, req, res, next) => {
            res.status(500).json({ error: err.message });
        });
    });

    // Update test paths to not include /trips prefix
    it('should handle GET /trips', async () => {
        mockDb.all.mockImplementation((q, p, cb) => cb(null, [
            { id: 1, name: 'Test Trip', start_date: '2024-02-12' }
        ]));

        const response = await request(app).get('/');
        expect(response.status).toBe(200);
    });

    it('should handle GET / (list trips)', async () => {
        // Setup mock data
        const mockTrips = [
            { id: 1, name: 'Test Trip 1', start_date: '2024-02-12' },
            { id: 2, name: 'Test Trip 2', start_date: '2024-02-13' }
        ];
        mockDb.all.mockImplementation((q, p, cb) => cb(null, mockTrips));

        const response = await request(app).get('/');
        expect(response.status).toBe(200);

        // Verify the response contains our mock data
        const body = response.body;
        expect(body.view).toBe('trips');
        expect(body.locals.trips).toEqual(mockTrips);
    });

    it('should handle POST /trips for creating new trip', async () => {
        const response = await request(app)
            .post('/')
            .send({
                name: 'New Trip',
                start_date: '2024-02-12',
                end_date: '2024-02-15',
                cost_of_rental: '1000',
                cost_per_seat: '50',
                total_seats: '20'
            });
        expect(response.status).toBe(302); // Redirect after creation
    });

    it('should handle GET /trips/:id/roster', async () => {
        mockDb.get.mockImplementation((q, p, cb) => cb(null, {
            id: 1, name: 'Test Trip'
        }));
        mockDb.all.mockImplementation((q, p, cb) => cb(null, [
            { id: 1, name: 'Rider 1', email: 'test@test.com' }
        ]));

        const response = await request(app).get('/1/roster');
        expect(response.status).toBe(200);
    });

    it('should handle POST /trips/:id/activate', async () => {
        const response = await request(app).post('/1/activate');
        expect(response.status).toBe(302); // Redirect after activation
    });

    it('should handle errors in trip creation', async () => {
        mockDb.run.mockImplementation((q, p, cb) => cb(new Error('DB Error')));

        const response = await request(app)
            .post('/')
            .send({
                name: 'Bad Trip',
                start_date: 'invalid'
            });
        expect(response.status).toBe(302); // Should redirect on error
    });

    it('should handle GET /trips/:id/add-riders', async () => {
        mockDb.get.mockImplementation((q, p, cb) => cb(null, {
            id: 1, name: 'Test Trip'
        }));
        mockDb.all.mockImplementation((q, p, cb) => cb(null, [
            { id: 1, name: 'Available Rider' }
        ]));

        const response = await request(app).get('/1/add-riders');
        expect(response.status).toBe(200);
    });

    it('should handle POST /trips/:id/add-riders', async () => {
        mockDb.get.mockImplementation((q, p, cb) => cb(null, {
            id: 1, name: 'Test Trip', cost_per_seat: 50
        }));

        const response = await request(app)
            .post('/1/add-riders')
            .send({
                selected_riders: ['1', '2'],
                seats: { '1': '2', '2': '1' }
            });
        expect(response.status).toBe(302); // Redirect after adding riders
    });
});
