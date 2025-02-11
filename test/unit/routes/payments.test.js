const createPaymentRouter = require('../../../src/routes/payments');
const express = require('express');
const request = require('supertest');

describe('Payment Routes', () => {
    let app, mockDb, mockEmailService;

    beforeEach(() => {
        app = express();
        app.set('view engine', 'pug');
        app.use(express.urlencoded({ extended: true }));

        // Bypass authentication middleware
        app.use((req, res, next) => {
            req.isAuthenticated = () => true;
            next();
        });

        // Mock database methods
        mockDb = {
            get: jest.fn((query, params, callback) => callback(null, null)),
            all: jest.fn((query, params, callback) => callback(null, [])),
            run: jest.fn((query, params, callback) => callback(null)),
            serialize: jest.fn((callback) => callback())
        };

        // Mock email service
        mockEmailService = {
            sendReceiptEmail: jest.fn().mockResolvedValue(true)
        };

        // Mock render method
        app.use((req, res, next) => {
            res.render = jest.fn().mockImplementation(() => res.sendStatus(200));
            next();
        });

        // Create router with mocked dependencies
        const paymentRouter = createPaymentRouter(mockDb, mockEmailService);
        app.use('/payments', paymentRouter);
    });

    describe('Payment Creation', () => {
        it('should create a new payment and redirect', async () => {
            // Set up sequential mocks
            mockDb.get
                .mockImplementationOnce((query, params, callback) => {
                    callback(null, { id: 1, is_active: 1 }); // Active trip
                })
                .mockImplementationOnce((query, params, callback) => {
                    callback(null, { id: 1, name: 'Test', email: 'test@test.com' }); // Rider
                });

            const response = await request(app)
                .post('/payments/add/1')
                .send({
                    date: '2024-02-11',
                    amount: '150.00'
                });

            expect(response.status).toBe(302); // Expect redirect
            expect(mockDb.run).toHaveBeenCalled();
        });
    });

    describe('Payment Retrieval', () => {
        it('should render payment history', async () => {
            mockDb.get.mockImplementation((query, params, callback) => {
                callback(null, { id: 1, name: 'Test' });
            });

            mockDb.all.mockImplementation((query, params, callback) => {
                callback(null, [
                    { id: 1, amount: 100, date: '2024-01-01' }
                ]);
            });

            const response = await request(app)
                .get('/payments/history/1');

            expect(response.status).toBe(200);
            expect(mockDb.get).toHaveBeenCalled();
            expect(mockDb.all).toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('should handle missing rider error in payment history', async () => {
            mockDb.get.mockImplementation((query, params, callback) => {
                callback(null, null); // No rider found
            });

            const response = await request(app)
                .get('/payments/history/999');
            
            expect(response.status).toBe(404);
            expect(response.text).toBe('Rider not found');
        });

        it('should handle database error in payment history', async () => {
            mockDb.get.mockImplementation((query, params, callback) => {
                callback(new Error('Database error'));
            });

            const response = await request(app)
                .get('/payments/history/1');
            
            expect(response.status).toBe(500);
            expect(response.text).toBe('Error retrieving rider');
        });

        it('should handle payment retrieval error', async () => {
            mockDb.get.mockImplementation((query, params, callback) => {
                callback(null, { id: 1, name: 'Test' });
            });

            mockDb.all.mockImplementation((query, params, callback) => {
                callback(new Error('Database error'));
            });

            const response = await request(app)
                .get('/payments/history/1');
            
            expect(response.status).toBe(500);
            expect(response.text).toBe('Error retrieving payments');
        });

        it('should handle missing active trip in payment creation', async () => {
            mockDb.get.mockImplementation((query, params, callback) => {
                callback(null, null); // No active trip
            });

            const response = await request(app)
                .post('/payments/add/1')
                .send({ date: '2024-02-11', amount: '100' });
            
            expect(response.status).toBe(404);
            expect(response.text).toBe('No active trip found');
        });

        it('should handle email service errors', async () => {
            mockDb.get
                .mockImplementationOnce((query, params, callback) => {
                    callback(null, { id: 1, is_active: 1 }); // Active trip
                })
                .mockImplementationOnce((query, params, callback) => {
                    callback(null, { id: 1, name: 'Test', email: 'test@test.com' });
                });

            mockEmailService.sendReceiptEmail.mockRejectedValue(new Error('Email error'));

            const response = await request(app)
                .post('/payments/add/1')
                .send({ date: '2024-02-11', amount: '100' });

            expect(response.status).toBe(302); // Should still redirect
            expect(mockEmailService.sendReceiptEmail).toHaveBeenCalled();
        });

        it('should handle payment deletion database errors', async () => {
            mockDb.get.mockImplementation((query, params, callback) => {
                callback(new Error('Database error'));
            });

            const response = await request(app)
                .post('/payments/delete/1');

            expect(response.status).toBe(500);
        });

        it('should handle payment update database errors', async () => {
            mockDb.run.mockImplementation((query, params, callback) => {
                callback(new Error('Database error'));
            });

            const response = await request(app)
                .post('/payments/edit/1')
                .send({ date: '2024-02-11', amount: '100' });

            expect(response.status).toBe(500);
        });
    });

    describe('Email Receipt Generation', () => {
        it('should format payment receipt correctly', async () => {
            const mockRider = {
                id: 1,
                name: 'Test Rider',
                email: 'test@test.com'
            };

            // Log request data for verification
            app.use((req, res, next) => {
                console.log('Request body:', req.body);
                next();
            });

            const testDate = '2024-02-11';
            const testAmount = '100';

            mockDb.get
                .mockImplementationOnce((query, params, callback) => {
                    callback(null, { id: 1, is_active: 1 }); // Active trip
                });

            const response = await request(app)
                .post('/payments/add/1')
                .type('form')  // Explicitly set content type
                .send({
                    date: testDate,
                    amount: testAmount
                });

            expect(mockEmailService.sendReceiptEmail).toHaveBeenCalledWith(
                '1',
                testDate,
                testAmount,
                1
            );
            expect(response.status).toBe(302);
        });
    });
});
