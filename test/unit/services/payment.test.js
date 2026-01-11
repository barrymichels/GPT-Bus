const createPaymentRouter = require('../../../src/routes/payments');
const express = require('express');
const request = require('supertest');

describe('Payment Service', () => {
    let app, mockDb, mockEmailService;

    beforeEach(() => {
        app = express();
        app.set('view engine', 'pug');
        app.use(express.urlencoded({ extended: true }));

        // Bypass authentication and add flash mock
        app.use((req, res, next) => {
            req.isAuthenticated = () => true;
            req.flash = () => {}; // Mock flash
            next();
        });

        // Mock database methods
        mockDb = {
            get: jest.fn(),
            all: jest.fn(),
            run: jest.fn(),
            serialize: jest.fn((callback) => callback())
        };

        // Mock email service
        mockEmailService = {
            sendReceiptEmail: jest.fn().mockResolvedValue(true)
        };

        // Mock response rendering
        app.use((req, res, next) => {
            res.render = jest.fn().mockImplementation(() => res.status(200).send());
            next();
        });

        // Create router with mocked dependencies
        const paymentRouter = createPaymentRouter(mockDb, mockEmailService);
        app.use('/payments', paymentRouter);
    });

    describe('Payment Creation', () => {
        it('should create a new payment and send receipt', async () => {
            const mockRider = {
                id: 1,
                name: 'Test Rider',
                email: 'test@example.com'
            };

            const mockTrip = {
                id: 1,
                is_active: 1
            };

            mockDb.get
                .mockImplementationOnce((query, params, callback) => {
                    callback(null, mockTrip);
                })
                .mockImplementationOnce((query, params, callback) => {
                    callback(null, mockRider);
                });

            mockDb.all.mockImplementation((query, params, callback) => {
                callback(null, []);
            });

            mockDb.run.mockImplementation((query, params, callback) => {
                callback(null);
            });

            const response = await request(app)
                .post('/payments/add/1')
                .send({
                    date: '2024-02-11',
                    amount: '150.00'
                });

            expect(response.status).toBe(302);
            expect(mockDb.run).toHaveBeenCalled();
        });

        it('should handle payment creation errors', async () => {
            mockDb.get.mockImplementation((query, params, callback) => {
                callback(new Error('Database error'));
            });

            const response = await request(app)
                .post('/payments/add/1')
                .send({
                    date: '2024-02-11',
                    amount: '150.00'
                });

            expect(response.status).toBe(500);
        });
    });

    describe('Payment Retrieval', () => {
        it('should retrieve payment history for a rider', async () => {
            const mockRider = {
                id: 1,
                name: 'Test Rider'
            };

            const mockPayments = [
                { id: 1, amount: 100, date: '2024-01-01' },
                { id: 2, amount: 200, date: '2024-01-15' }
            ];

            mockDb.get.mockImplementation((query, params, callback) => {
                callback(null, mockRider);
            });

            mockDb.all.mockImplementation((query, params, callback) => {
                callback(null, mockPayments);
            });

            const response = await request(app)
                .get('/payments/history/1');

            expect(response.status).toBe(200);
            expect(mockDb.get).toHaveBeenCalled();
            expect(mockDb.all).toHaveBeenCalled();
        });
    });

    describe('Payment Updates', () => {
        it('should update existing payment', async () => {
            const mockPayment = {
                id: 1,
                rider_id: 1,
                amount: 100,
                date: '2024-01-01'
            };

            mockDb.get.mockImplementation((query, params, callback) => {
                callback(null, mockPayment);
            });

            mockDb.run.mockImplementation((query, params, callback) => {
                callback(null);
            });

            const response = await request(app)
                .post('/payments/edit/1')
                .send({
                    date: '2024-02-11',
                    amount: '150.00'
                });

            expect(response.status).toBe(302);
            expect(mockDb.run).toHaveBeenCalled();
        });
    });

    describe('Payment Deletion', () => {
        it('should delete payment and redirect', async () => {
            mockDb.get.mockImplementation((query, params, callback) => {
                callback(null, { rider_id: 1 });
            });

            mockDb.run.mockImplementation((query, params, callback) => {
                callback(null);
            });

            const response = await request(app)
                .post('/payments/delete/1');

            expect(response.status).toBe(302);
            expect(mockDb.run).toHaveBeenCalled();
        });
    });
});
