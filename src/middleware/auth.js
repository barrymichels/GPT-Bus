const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');

/**
 * Configure passport authentication strategies and user serialization
 * @param {Object} db - Database connection instance
 */
function configurePassport(db) {
    // Local strategy configuration
    passport.use(
        new LocalStrategy((username, password, done) => {
            db.get(
                "SELECT id, username, password FROM users WHERE username = ?",
                [username],
                (err, row) => {
                    if (err) return done(err);
                    if (!row)
                        return done(null, false, { message: "Incorrect username." });
                    bcrypt.compare(password, row.password, (err, res) => {
                        if (res)
                            return done(null, { id: row.id, username: row.username });
                        return done(null, false, { message: "Incorrect password." });
                    });
                }
            );
        })
    );

    // User serialization for session storage
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    // User deserialization from session
    passport.deserializeUser((id, done) => {
        db.get("SELECT id, username FROM users WHERE id = ?", [id], (err, row) => {
            if (!row) return done(null, false);
            return done(null, { id: row.id, username: row.username });
        });
    });
}

/**
 * Middleware to check if user is authenticated
 */
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

module.exports = {
    configurePassport,
    isAuthenticated
};
