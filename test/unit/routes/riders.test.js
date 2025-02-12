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
            get: jest.fn((q, p, cb) => cb(null, { id: 1, name: 'Test Trip', cost_per_seat: 50 })),
            run: jest.fn((q, p, cb) => typeof cb === 'function' ? cb(null) : undefined),
            all: jest.fn((q, p, cb) => cb(null, [])),
            serialize: jest.fn((cb) => cb())
        };

        const riderRouter = createRiderRouter(mockDb);
        app.use('/riders', riderRouter);

        app.use(express.static('public'));
        app.set('view engine', 'pug');
    });

    describe('Add Rider', () => {
        it('should handle GET /riders/add with active trip', async () => {
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(null, {
                id: 1, name: 'Active Trip'
            }));

            const response = await request(app).get('/riders/add');
            expect(response.status).toBe(200);
        });

        it('should handle GET /riders/add with no active trip', async () => {
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(null, null));

            const response = await request(app).get('/riders/add');
            expect(response.status).toBe(200);
            expect(mockDb.get).toHaveBeenCalledWith(
                expect.stringContaining("is_active = 1"),
                [],
                expect.any(Function)
            );
        });

        it('should handle database error in GET /riders/add', async () => {
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(new Error('Database error')));

            const response = await request(app).get('/riders/add');
            expect(response.status).toBe(200);
            expect(response.text).toContain('Database error occurred');
        });

        it('should handle POST /riders/add success', async () => {
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(null, {
                id: 1,
                name: 'Active Trip',
                cost_per_seat: 50
            }));

            const response = await request(app)
                .post('/riders/add')
                .send({
                    name: 'New Rider',
                    email: 'test@test.com',
                    phone: '1234567890',
                    seats: '2',
                    street: '123 Main St',
                    city: 'Test City',
                    state: 'TS',
                    zip: '12345'
                });
            expect(response.status).toBe(302);
            expect(mockDb.run).toHaveBeenCalled();
        });

        it('should handle POST /riders/add with no active trip', async () => {
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(null, null));

            const response = await request(app)
                .post('/riders/add')
                .send({
                    name: 'New Rider',
                    email: 'test@test.com',
                    phone: '1234567890',
                    seats: '2'
                });
            expect(response.status).toBe(302);
            expect(response.header.location).toBe('/trips');
        });
    });

    describe('Edit Rider', () => {
        it('should handle GET /riders/:id/edit', async () => {
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(null, {
                id: 1,
                name: 'Test Rider'
            }));

            const response = await request(app).get('/riders/1/edit');
            expect(response.status).toBe(200);
        });

        it('should handle database error in GET /riders/:id/edit', async () => {
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(new Error('Database error')));

            const response = await request(app).get('/riders/1/edit');
            expect(response.status).toBe(500);
        });

        it('should handle POST /riders/:id/edit success', async () => {
            const response = await request(app)
                .post('/riders/1/edit')
                .send({
                    name: 'Updated Rider',
                    email: 'test@test.com',
                    phone: '1234567890',
                    seats: '2',
                    balance: '100',
                    instructions_sent: 'true'
                });
            expect(response.status).toBe(302);
            expect(mockDb.run).toHaveBeenCalledTimes(2);
        });

        it('should handle database error in POST /riders/:id/edit', async () => {
            mockDb.run.mockImplementationOnce((q, p, cb) => cb(new Error('Database error')));

            const response = await request(app)
                .post('/riders/1/edit')
                .send({
                    name: 'Updated Rider',
                    email: 'test@test.com'
                });
            expect(response.status).toBe(500);
        });
    });

    describe('Delete Rider', () => {
        it('should handle GET /riders/:id/delete with no payments', async () => {
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(null, { paymentCount: 0 }));

            const response = await request(app).get('/riders/1/delete');
            expect(response.status).toBe(302);
            expect(mockDb.run).toHaveBeenCalledWith(
                expect.stringContaining("DELETE FROM riders"),
                ["1"],
                expect.any(Function)
            );
        });

        it('should prevent deletion if rider has payments', async () => {
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(null, { paymentCount: 1 }));

            const response = await request(app).get('/riders/1/delete');
            expect(response.status).toBe(302);
            expect(mockDb.run).not.toHaveBeenCalledWith(
                expect.stringContaining("DELETE FROM riders"),
                expect.any(Array),
                expect.any(Function)
            );
        });
    });

    describe('Rider Payments', () => {
        it('should handle GET /riders/:id/payments', async () => {
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(null, {
                id: 1,
                name: 'Test Rider'
            }));
            mockDb.all.mockImplementationOnce((q, p, cb) => cb(null, [
                { id: 1, amount: 100, date: '2024-02-12' }
            ]));

            const response = await request(app).get('/riders/1/payments');
            expect(response.status).toBe(200);
        });

        it('should handle database error in GET /riders/:id/payments', async () => {
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(new Error('Database error')));

            const response = await request(app).get('/riders/1/payments');
            expect(response.status).toBe(500);
        });
    });

    describe('Emergency Contacts', () => {
        it('should handle GET /riders/:id/emergency-contacts', async () => {
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(null, {
                id: 1,
                name: 'Test Rider'
            }));
            mockDb.all.mockImplementationOnce((q, p, cb) => cb(null, [
                { name: 'Contact 1', contact_order: 1 },
                { name: 'Contact 2', contact_order: 2 }
            ]));

            const response = await request(app).get('/riders/1/emergency-contacts');
            expect(response.status).toBe(200);
        });

        it('should handle non-existent rider in GET /riders/:id/emergency-contacts', async () => {
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(null, null));

            const response = await request(app).get('/riders/1/emergency-contacts');
            expect(response.status).toBe(302);
        });

        it('should handle POST /riders/:id/emergency-contacts success', async () => {
            const response = await request(app)
                .post('/riders/1/emergency-contacts')
                .send({
                    contact1_name: 'Emergency Contact 1',
                    contact1_relationship: 'Parent',
                    contact1_phone: '1234567890',
                    medical_notes: 'Test notes'
                });
            expect(response.status).toBe(302);
            expect(mockDb.run).toHaveBeenCalledWith(
                expect.stringContaining("UPDATE riders SET medical_notes"),
                expect.any(Array)
            );
        });

        it('should validate secondary contact in POST /riders/:id/emergency-contacts', async () => {
            mockDb.get.mockImplementationOnce((q, p, cb) => cb(null, {
                id: 1,
                name: 'Test Rider'
            }));
            mockDb.all.mockImplementationOnce((q, p, cb) => cb(null, []));

            const response = await request(app)
                .post('/riders/1/emergency-contacts')
                .send({
                    contact1_name: 'Primary Contact',
                    contact1_relationship: 'Parent',
                    contact1_phone: '1234567890',
                    contact2_name: 'Secondary Contact',
                    contact2_relationship: '',
                    contact2_phone: '',
                    medical_notes: 'Test notes'
                });
            expect(response.status).toBe(302);
        });
    });
});
