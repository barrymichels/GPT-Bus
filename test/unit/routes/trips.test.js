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
        app.use('/', tripRouter);

        // Error handling should be last
        app.use((err, req, res, next) => {
            res.status(500).json({ error: err.message });
        });
    });

    describe('Trip Listing', () => {
        it('should handle GET /trips successfully', async () => {
            mockDb.all.mockImplementation((q, p, cb) => cb(null, [
                { id: 1, name: 'Test Trip', start_date: '2024-02-12' }
            ]));

            const response = await request(app).get('/');
            expect(response.status).toBe(200);
            expect(response.body.view).toBe('trips');
        });

        it('should handle database error in trip listing', async () => {
            mockDb.all.mockImplementation((q, p, cb) => cb(new Error('Database error')));

            const response = await request(app).get('/');
            expect(response.status).toBe(500);
        });
    });

    describe('Trip Creation', () => {
        it('should create a valid trip', async () => {
            mockDb.run.mockImplementation((q, p, cb) => cb(null));
            const response = await request(app)
                .post('/')
                .type('form')
                .send({
                    name: 'New Trip',
                    start_date: '2024-02-12',
                    end_date: '2024-02-15',
                    cost_of_rental: '1000',
                    cost_per_seat: '50',
                    total_seats: '20'
                });
            expect(response.status).toBe(302);
            expect(mockDb.run).toHaveBeenCalled();
        });

        it('should handle invalid input in trip creation', async () => {
            const response = await request(app)
                .post('/')
                .type('form')
                .send({
                    name: 'Invalid Trip',
                    start_date: 'invalid-date',
                    cost_of_rental: 'not-a-number',
                    cost_per_seat: 'invalid'
                });
            expect(response.status).toBe(302);
            expect(mockDb.run).not.toHaveBeenCalled();
        });

        it('should handle missing required fields', async () => {
            const response = await request(app)
                .post('/')
                .type('form')
                .send({});
            expect(response.status).toBe(302);
            expect(mockDb.run).not.toHaveBeenCalled();
        });

        it('should handle database error in trip creation', async () => {
            mockDb.run.mockImplementation((q, p, cb) => cb(new Error('Database error')));

            const response = await request(app)
                .post('/')
                .type('form')
                .send({
                    name: 'New Trip',
                    start_date: '2024-02-12',
                    end_date: '2024-02-15',
                    cost_of_rental: '1000',
                    cost_per_seat: '50',
                    total_seats: '20'
                });
            expect(response.status).toBe(302);
        });
    });

    describe('Trip Roster', () => {
        it('should display trip roster', async () => {
            mockDb.get.mockImplementation((q, p, cb) => cb(null, {
                id: 1, name: 'Test Trip'
            }));
            mockDb.all.mockImplementation((q, p, cb) => cb(null, [
                { 
                    id: 1, 
                    name: 'Rider 1',
                    contact1_name: 'Emergency Contact 1',
                    contact2_name: 'Emergency Contact 2'
                }
            ]));

            const response = await request(app).get('/1/roster');
            expect(response.status).toBe(200);
        });

        it('should handle missing trip in roster view', async () => {
            mockDb.get.mockImplementation((q, p, cb) => cb(null, null));

            const response = await request(app).get('/1/roster');
            expect(response.status).toBe(302);
        });

        it('should handle database error in roster retrieval', async () => {
            mockDb.get.mockImplementation((q, p, cb) => cb(new Error('Database error')));

            const response = await request(app).get('/1/roster');
            expect(response.status).toBe(500);
        });

        it('should handle error in rider retrieval for roster', async () => {
            mockDb.get.mockImplementation((q, p, cb) => cb(null, { id: 1 }));
            mockDb.all.mockImplementation((q, p, cb) => cb(new Error('Database error')));

            const response = await request(app).get('/1/roster');
            expect(response.status).toBe(500);
        });
    });

    describe('Add Riders to Trip', () => {
        it('should show add riders form', async () => {
            const response = await request(app).get('/1/add-riders');
            expect(response.status).toBe(200);
        });

        it('should handle missing trip ID in add riders', async () => {
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(null, null)); // Trip not found
            const response = await request(app).get('/invalid/add-riders');
            expect(response.status).toBe(302);
            expect(mockDb.get).toHaveBeenCalled();
        });

        it('should handle database error in add riders form', async () => {
            mockDb.get.mockImplementation((q, p, cb) => cb(new Error('Database error')));
            const response = await request(app).get('/1/add-riders');
            expect(response.status).toBe(302);
        });

        it('should add riders successfully', async () => {
            mockDb.get.mockImplementation((q, p, cb) => cb(null, {
                id: 1, name: 'Test Trip', cost_per_seat: 50
            }));

            const response = await request(app)
                .post('/1/add-riders')
                .type('form')
                .send({
                    selected_riders: ['1', '2'],
                    seats: { '1': '2', '2': '1' }
                });
            expect(response.status).toBe(302);
        });

        it('should handle missing rider selection', async () => {
            const response = await request(app)
                .post('/1/add-riders')
                .type('form')
                .send({});
            expect(response.status).toBe(302);
        });
    });

    describe('Trip Activation', () => {
        it('should activate trip successfully', async () => {
            const response = await request(app).post('/1/activate');
            expect(response.status).toBe(302);
            expect(mockDb.run).toHaveBeenCalledTimes(2); // Deactivate all + activate one
        });

        it('should handle missing trip ID in activation', async () => {
            const response = await request(app).post('/invalid/activate');
            expect(response.status).toBe(302);
        });

        it('should handle database error in deactivation step', async () => {
            mockDb.run.mockImplementationOnce((q, p, cb) => cb(new Error('Database error')));
            
            const response = await request(app).post('/1/activate');
            expect(response.status).toBe(302);
        });

        it('should handle database error in activation step', async () => {
            mockDb.run
                .mockImplementationOnce((q, p, cb) => cb(null)) // Deactivate succeeds
                .mockImplementationOnce((q, p, cb) => cb(new Error('Database error'))); // Activate fails
            
            const response = await request(app).post('/1/activate');
            expect(response.status).toBe(302);
        });
    });
});
