const express = require('express');
const request = require('supertest');
const createRiderRouter = require('../../../src/routes/riders');

describe('Rider Complete Deletion Integration Test', () => {
    let app, mockDb;

    beforeEach(() => {
        app = express();
        app.use(express.urlencoded({ extended: true }));
        app.use((req, res, next) => { 
            req.isAuthenticated = () => true; 
            req.flash = () => {}; // Mock flash
            next(); 
        });

        mockDb = {
            get: jest.fn(),
            run: jest.fn(),
            all: jest.fn(),
            serialize: jest.fn((cb) => cb())
        };

        const riderRouter = createRiderRouter(mockDb);
        app.use('/riders', riderRouter);

        app.set('view engine', 'pug');
    });

    it('should delete rider with all related data in correct order', async () => {
        const riderId = '123';
        let deleteCallOrder = [];

        // Mock successful deletion callbacks
        mockDb.run.mockImplementation((query, params, callback) => {
            deleteCallOrder.push({
                query: query.trim(),
                params
            });
            if (callback) callback(null);
        });

        const response = await request(app)
            .post(`/riders/${riderId}/complete`);

        expect(response.status).toBe(302);
        expect(response.header.location).toBe('/dashboard');

        // Verify deletion order
        expect(deleteCallOrder).toHaveLength(4);
        
        // 1. Emergency contacts deleted first
        expect(deleteCallOrder[0].query).toContain('DELETE FROM emergency_contacts');
        expect(deleteCallOrder[0].params).toEqual([riderId]);
        
        // 2. Payments deleted second
        expect(deleteCallOrder[1].query).toContain('DELETE FROM payments');
        expect(deleteCallOrder[1].params).toEqual([riderId]);
        
        // 3. Trip riders deleted third
        expect(deleteCallOrder[2].query).toContain('DELETE FROM trip_riders');
        expect(deleteCallOrder[2].params).toEqual([riderId]);
        
        // 4. Rider deleted last
        expect(deleteCallOrder[3].query).toContain('DELETE FROM riders');
        expect(deleteCallOrder[3].params).toEqual([riderId]);
    });

    it('should stop deletion process if any step fails', async () => {
        const riderId = '456';
        let deleteCallOrder = [];

        // Mock failure on payments deletion (second step)
        mockDb.run.mockImplementation((query, params, callback) => {
            deleteCallOrder.push({
                query: query.trim(),
                params
            });
            
            if (query.includes('DELETE FROM payments') && callback) {
                callback(new Error('Foreign key constraint failed'));
            } else if (callback) {
                callback(null);
            }
        });

        const response = await request(app)
            .post(`/riders/${riderId}/complete`);

        expect(response.status).toBe(500);
        expect(response.text).toBe('Database error occurred');

        // Verify only attempted first two deletions
        expect(deleteCallOrder).toHaveLength(2);
        
        // Should NOT have attempted to delete trip_riders or rider
        expect(deleteCallOrder.find(call => call.query.includes('DELETE FROM trip_riders'))).toBeUndefined();
        expect(deleteCallOrder.find(call => call.query.includes('DELETE FROM riders') && call.query.includes('WHERE id ='))).toBeUndefined();
    });

    it('should handle scenario with rider in multiple trips', async () => {
        const riderId = '789';
        const deletedTables = [];

        // Track which tables were deleted from
        mockDb.run.mockImplementation((query, params, callback) => {
            if (query.includes('DELETE FROM emergency_contacts')) {
                deletedTables.push('emergency_contacts');
            } else if (query.includes('DELETE FROM payments')) {
                deletedTables.push('payments');
            } else if (query.includes('DELETE FROM trip_riders')) {
                deletedTables.push('trip_riders');
            } else if (query.includes('DELETE FROM riders')) {
                deletedTables.push('riders');
            }
            
            if (callback) callback(null);
        });

        const response = await request(app)
            .post(`/riders/${riderId}/complete`);

        expect(response.status).toBe(302);
        
        // Verify all tables were cleaned up
        expect(deletedTables).toEqual([
            'emergency_contacts',
            'payments',
            'trip_riders',
            'riders'
        ]);
    });
});