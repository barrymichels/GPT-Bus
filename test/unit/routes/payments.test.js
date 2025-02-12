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

        // Create router with mocked dependencies
        const paymentRouter = createPaymentRouter(mockDb, mockEmailService);
        app.use('/payments', paymentRouter);
    });

    describe('Payment Creation', () => {
        it('should create a new payment and redirect', async () => {
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

            expect(response.status).toBe(302);
            expect(mockDb.run).toHaveBeenCalled();
        });

        it('should render add payment form', async () => {
            const response = await request(app).get('/payments/add/1');
            expect(response.status).toBe(200);
            expect(response.statusCode).toBe(200);
        });
    });

    describe('Payment Editing', () => {
        it('should render edit payment form', async () => {
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(null, {
                id: 1,
                amount: 100,
                date: '2024-02-11',
                rider_id: 1
            }));

            const response = await request(app).get('/payments/edit/1');
            expect(response.status).toBe(200);
            expect(response.statusCode).toBe(200);
        });

        it('should handle database error in edit form retrieval', async () => {
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(new Error('Database error')));

            const response = await request(app).get('/payments/edit/1');
            expect(response.status).toBe(500);
        });

        it('should update payment and redirect', async () => {
            mockDb.run.mockImplementationOnce((q, p, cb) => cb(null));
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(null, { rider_id: 1 }));

            const response = await request(app)
                .post('/payments/edit/1')
                .send({
                    date: '2024-02-11',
                    amount: '200.00'
                });

            expect(response.status).toBe(302);
            expect(mockDb.run).toHaveBeenCalled();
        });

        it('should handle database error in payment update', async () => {
            mockDb.run.mockImplementationOnce((q, p, cb) => cb(new Error('Database error')));

            const response = await request(app)
                .post('/payments/edit/1')
                .send({
                    date: '2024-02-11',
                    amount: '200.00'
                });

            expect(response.status).toBe(500);
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

            const response = await request(app).get('/payments/history/1');
            expect(response.status).toBe(200);
            expect(mockDb.get).toHaveBeenCalled();
            expect(mockDb.all).toHaveBeenCalled();
        });
    });

    describe('Payment Deletion', () => {
        it('should delete payment and redirect', async () => {
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(null, { rider_id: 1 }));
            mockDb.run.mockImplementationOnce((q, p, cb) => cb(null));

            const response = await request(app).post('/payments/delete/1');
            expect(response.status).toBe(302);
            expect(mockDb.run).toHaveBeenCalledWith(
                expect.stringContaining('DELETE FROM payments'),
                expect.any(Array),
                expect.any(Function)
            );
        });

        it('should handle rider lookup error in deletion', async () => {
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(new Error('Database error')));

            const response = await request(app).post('/payments/delete/1');
            expect(response.status).toBe(500);
        });

        it('should handle delete query error', async () => {
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(null, { rider_id: 1 }));
            mockDb.run.mockImplementationOnce((q, p, cb) => cb(new Error('Database error')));

            const response = await request(app).post('/payments/delete/1');
            expect(response.status).toBe(500);
        });
    });

    describe('Error Handling', () => {
        it('should handle missing rider error in payment history', async () => {
            mockDb.get.mockImplementation((query, params, callback) => {
                callback(null, null);
            });

            const response = await request(app).get('/payments/history/999');
            expect(response.status).toBe(404);
            expect(response.text).toBe('Rider not found');
        });

        it('should handle database error in payment history', async () => {
            mockDb.get.mockImplementation((query, params, callback) => {
                callback(new Error('Database error'));
            });

            const response = await request(app).get('/payments/history/1');
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

            const response = await request(app).get('/payments/history/1');
            expect(response.status).toBe(500);
            expect(response.text).toBe('Error retrieving payments');
        });

        it('should handle missing active trip in payment creation', async () => {
            mockDb.get.mockImplementation((query, params, callback) => {
                callback(null, null);
            });

            const response = await request(app)
                .post('/payments/add/1')
                .send({
                    date: '2024-02-11',
                    amount: '100'
                });
            
            expect(response.status).toBe(404);
            expect(response.text).toBe('No active trip found');
        });

        it('should handle email service errors', async () => {
            mockDb.get
                .mockImplementationOnce((query, params, callback) => {
                    callback(null, { id: 1, is_active: 1 });
                })
                .mockImplementationOnce((query, params, callback) => {
                    callback(null, { id: 1, name: 'Test', email: 'test@test.com' });
                });

            mockEmailService.sendReceiptEmail.mockRejectedValue(new Error('Email error'));

            const response = await request(app)
                .post('/payments/add/1')
                .send({
                    date: '2024-02-11',
                    amount: '100'
                });

            expect(response.status).toBe(302);
            expect(mockEmailService.sendReceiptEmail).toHaveBeenCalled();
        });
    });

    describe('Email Receipt Generation', () => {
        it('should format payment receipt correctly', async () => {
            const testDate = '2024-02-11';
            const testAmount = '100.00';

            mockDb.get
                .mockImplementationOnce((query, params, callback) => {
                    callback(null, { id: 1, is_active: 1 }); // Active trip
                });

            const response = await request(app)
                .post('/payments/add/1')
                .type('form')
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
