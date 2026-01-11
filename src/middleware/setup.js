const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const passport = require('passport');
const path = require('path');
const config = require('../config');

function setupMiddleware(app) {
    // Express middleware configuration
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    app.use(
        session({
            store: new SQLiteStore({
                db: config.DB_PATH,
                table: "sessions",
            }),
            secret: config.SESSION_SECRET,
            resave: false,
            saveUninitialized: false,
            cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
        })
    );
    app.use(passport.initialize());
    app.use(passport.session());

    // Flash message middleware (stores messages in session, clears after reading)
    app.use((req, res, next) => {
        // Initialize flash in session if not present
        if (!req.session.flash) {
            req.session.flash = {};
        }
        
        // Helper to set flash message
        req.flash = (type, message) => {
            req.session.flash = { type, message };
        };
        
        // Pass flash messages to all views and clear them
        res.locals.flash = req.session.flash;
        req.session.flash = {};
        
        next();
    });

    // View engine and static files setup
    app.set("view engine", "pug");
    app.set("views", "./views");
    app.use(express.static(path.join(process.cwd(), "public")));
}

module.exports = setupMiddleware;
