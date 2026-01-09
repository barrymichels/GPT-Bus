const express = require('express');
const request = require('supertest');
const createDashboardRouter = require('../../../src/routes/dashboard');

describe('Dashboard Routes', () => {
    let app, mockDb;

    beforeEach(() => {
        app = express();
        app.use(express.urlencoded({ extended: true }));

        // Override res.render to send JSON instead
        app.use((req, res, next) => {
            res.render = (view, options) => res.status(200).json({ view, ...options });
            next();
        });

        // Bypass authentication middleware
        app.use((req, res, next) => {
            req.isAuthenticated = () => true;
            next();
        });

        // Initialize a new mock db for each test
        mockDb = {
            get: jest.fn(),
            all: jest.fn(),
            serialize: jest.fn((cb) => cb())
        };

        const dashboardRouter = createDashboardRouter(mockDb);
        app.use('/', dashboardRouter);
    });

    it('should render dashboard when an active trip exists', async () => {
        // Provide an active trip with required fields
        const activeTrip = { id: 10, cost_of_rental: 500, total_seats: 20, cost_per_seat: 25 };
        mockDb.get.mockImplementationOnce((q, params, cb) => {
            cb(null, activeTrip);
        });
        // Return some riders with payment details
        const riders = [
            { id: 1, total_payments: 100, name: 'Alice', seats: 2 }
        ];
        mockDb.all.mockImplementationOnce((q, params, cb) => {
            cb(null, riders);
        });

        const response = await request(app).get('/');
        expect(response.status).toBe(200);
        expect(response.body.view).toBe('dashboard');
        expect(response.body.activeTrip).toEqual(activeTrip);
    });

    it('should redirect to /add-trip when no active trip exists and no trips at all', async () => {
        // No active trip found
        mockDb.get.mockImplementationOnce((q, params, cb) => {
            cb(null, null);
        });
        // Simulate no trips by returning count = 0
        mockDb.get.mockImplementationOnce((q, params, cb) => {
            cb(null, { count: 0 });
        });

        const response = await request(app).get('/');
        expect(response.status).toBe(302);
        expect(response.header.location).toBe('/add-trip');
    });

    it('should redirect to /trips when no active trip exists but trips exist', async () => {
        // No active trip found
        mockDb.get.mockImplementationOnce((q, params, cb) => {
            cb(null, null);
        });
        // Simulate existing trips by returning count > 0
        mockDb.get.mockImplementationOnce((q, params, cb) => {
            cb(null, { count: 5 });
        });

        const response = await request(app).get('/');
        expect(response.status).toBe(302);
        expect(response.header.location).toBe('/trips');
    });

    // ... additional tests as needed ...
});
