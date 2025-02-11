const express = require('express');
const passport = require('passport');

function createAuthRouter() {
    const router = express.Router();

    // Login page
    router.get('/login', (req, res) => res.render('login'));

    // Process login
    router.post('/login', passport.authenticate('local', {
        successRedirect: '/dashboard',
        failureRedirect: '/login',
    }));

    // Logout
    router.get('/logout', (req, res) => {
        req.logout(() => {
            res.redirect('/login');
        });
    });

    return router;
}

module.exports = createAuthRouter;
