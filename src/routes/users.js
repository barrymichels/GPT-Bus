const express = require('express');
const bcrypt = require('bcrypt');
const { isAuthenticated } = require('../middleware/auth');

function createUserRouter(db) {
    const router = express.Router();

    // Change password form - remove the '/change-password' prefix since it's handled by the mount point
    router.get('/', isAuthenticated, (req, res) => {
        res.render('change-password');
    });

    // Process password change - remove the '/change-password' prefix
    router.post('/', isAuthenticated, (req, res) => {
        const { newPassword } = req.body;
        bcrypt.hash(newPassword, 10, (err, hash) => {
            if (err) throw err;
            db.run(
                "UPDATE users SET password = ? WHERE id = ?",
                [hash, req.user.id],
                (err) => {
                    if (err) throw err;
                    res.redirect("/dashboard");
                }
            );
        });
    });

    // Add user form
    router.get('/add', isAuthenticated, (req, res) => {
        res.render('add-user');
    });

    // Process new user creation
    router.post('/add', isAuthenticated, (req, res) => {
        const { username, password } = req.body;
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) throw err;
            db.run(
                "INSERT INTO users (username, password) VALUES (?, ?)",
                [username, hash],
                (err) => {
                    if (err) throw err;
                    res.redirect("/dashboard");
                }
            );
        });
    });

    return router;
}

module.exports = createUserRouter;
