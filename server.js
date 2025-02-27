require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const passport = require("passport");
const path = require("path");
const bcrypt = require('bcrypt'); // Add missing import
const { initializeDatabase } = require('./src/services/db/init');
const { configurePassport, isAuthenticated } = require('./src/middleware/auth');
const createTripRouter = require('./src/routes/trips');
const createRiderRouter = require('./src/routes/riders');
const createPaymentRouter = require('./src/routes/payments');
const emailService = require('./src/services/email');
const createUserRouter = require('./src/routes/users');
const createDashboardRouter = require('./src/routes/dashboard');
const createAuthRouter = require('./src/routes/auth');
const setupMiddleware = require('./src/middleware/setup');

function createServer(db) {
    const app = express();

    // Configure passport
    configurePassport(db);

    // Setup middleware
    setupMiddleware(app);

    // Routes that don't require authentication
    app.get("/", (req, res) => res.redirect("/dashboard"));
    
    // Mount routers
    const authRouter = createAuthRouter();
    const dashboardRouter = createDashboardRouter(db);
    const userRouter = createUserRouter(db);
    const paymentRouter = createPaymentRouter(db, emailService);
    const tripRouter = createTripRouter(db);
    const riderRouter = createRiderRouter(db);

    // Mount auth and dashboard routes
    app.use('/', authRouter);
    app.use('/dashboard', dashboardRouter);

    // Mount user routes
    app.use('/change-password', userRouter);
    app.use('/add-user', (req, res) => {
        req.url = '/add' + req.url.replace('/add-user', '');
        userRouter.handle(req, res);
    });

    // Mount payment routes
    app.use('/rider/:id/payments', (req, res) => {
        req.url = '/history/' + req.params.id;
        paymentRouter.handle(req, res);
    });
    app.use('/add-payment', (req, res) => {
        req.url = '/add' + req.url.replace('/add-payment', '');
        paymentRouter.handle(req, res);
    });
    app.use('/edit-payment', (req, res) => {
        req.url = '/edit' + req.url.replace('/edit-payment', '');
        paymentRouter.handle(req, res);
    });
    app.use('/delete-payment', (req, res) => {
        req.url = '/delete' + req.url.replace('/delete-payment', '');
        paymentRouter.handle(req, res);
    });
    app.use('/payments', paymentRouter);

    // Mount trip routes
    app.use('/trips', tripRouter);
    app.get('/add-trip', isAuthenticated, (req, res) => {
        res.render('add-trip');
    });
    app.post('/add-trip', (req, res) => {
        req.url = '/';
        tripRouter.handle(req, res);
    });
    app.use('/trip', tripRouter);

    // Mount rider routes
    app.use('/riders', riderRouter);
    app.use('/add-rider', (req, res) => {
        req.url = '/add';
        riderRouter.handle(req, res);
    });
    app.use('/edit-rider', (req, res) => {
        req.url = req.url.replace('/edit-rider', '/riders') + '/edit';
        riderRouter.handle(req, res);
    });
    app.use('/delete-rider', (req, res) => {
        if (req.url.includes('/from-trip')) {
            req.url = req.url.replace('/delete-rider', '/riders').replace('/from-trip', '/from-trip');
        } else {
            req.url = req.url.replace('/delete-rider', '/riders') + '/delete';
        }
        riderRouter.handle(req, res);
    });
    app.use('/rider', riderRouter);

    return app;
}

// Update initialization to inject the db into createServer
async function initDbAndStartServer() {
    try {
        const db = await initializeDatabase();
        const app = createServer(db);
        app.listen(3000, () => {
            console.log("Server running on http://localhost:3000");
        });
    } catch (err) {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    }
}

// Export createServer and initDbAndStartServer for testing/dependency injection
module.exports = { 
    createServer,
    initDbAndStartServer 
};

// Only start server if this file is run directly
if (require.main === module) {
    initDbAndStartServer();
}
