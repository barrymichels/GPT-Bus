const express = require('express');
const passport = require('passport');

function createAuthRouter() {
    const router = express.Router();

    // Login page
    router.get('/login', (req, res) => {
        const error = req.query.error === '1' ? 'Invalid username or password' : null;
        res.render('login', { error });
    });

    // Process login
    router.post('/login', passport.authenticate('local', {
        successRedirect: '/dashboard',
        failureRedirect: '/login?error=1',
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
