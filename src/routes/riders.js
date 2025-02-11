const express = require('express');
const { isAuthenticated } = require('../middleware/auth');

/**
 * Create router for rider-related routes
 * @param {Object} db - Database connection
 */
function createRiderRouter(db) {
    const router = express.Router();

    // Add new rider form
    router.get("/add", isAuthenticated, (req, res) => {
        db.get("SELECT * FROM trips WHERE is_active = 1", [], (err, activeTrip) => {
            if (err) {
                console.error('Database error:', err);
                return res.render("add-rider", { error: "Database error occurred" });
            }
            
            if (!activeTrip) {
                return res.render("add-rider", { 
                    error: "No active trip selected. Please select a trip first.",
                    showTripLink: true
                });
            }
            
            res.render("add-rider", { 
                activeTrip,
                formTitle: `Add New Rider to ${activeTrip.name}`
            });
        });
    });

    // Create new rider
    router.post("/add", isAuthenticated, (req, res) => {
        db.get("SELECT * FROM trips WHERE is_active = 1", [], (err, activeTrip) => {
            if (err) throw err;
            if (!activeTrip) {
                return res.redirect("/trips");
            }
            const { name, email, phone, seats, street, city, state, zip } = req.body;
            const balance = parseInt(seats) * activeTrip.cost_per_seat;

            db.serialize(() => {
                db.run(
                    "INSERT INTO riders (name, email, phone, street, city, state, zip) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [name, email, phone, street || "", city || "", state || "", zip || ""],
                    function (err) {
                        if (err) throw err;
                        const riderId = this.lastID;
                        db.run(
                            "INSERT INTO trip_riders (trip_id, rider_id, seats, balance) VALUES (?, ?, ?, ?)",
                            [activeTrip.id, riderId, parseInt(seats), balance],
                            (err) => {
                                if (err) throw err;
                                res.redirect("/dashboard");
                            }
                        );
                    }
                );
            });
        });
    });

    // Edit rider form
    router.get("/:id/edit", isAuthenticated, (req, res) => {
        db.get(
            "SELECT * FROM riders WHERE id = ?",
            [req.params.id],
            (err, rider) => {
                if (err) throw err;
                res.render("edit-rider", { rider });
            }
        );
    });

    // Update rider
    router.post("/:id/edit", isAuthenticated, (req, res) => {
        const { name, email, phone, seats, balance, street, city, state, zip, instructions_sent } = req.body;
        
        db.run(
            "UPDATE riders SET name = ?, email = ?, phone = ?, street = ?, city = ?, state = ?, zip = ? WHERE id = ?",
            [name, email, phone, street, city, state, zip, req.params.id],
            (err) => {
                if (err) throw err;
                db.run(
                    "UPDATE trip_riders SET seats = ?, balance = ?, instructions_sent = ? WHERE rider_id = ?",
                    [seats, balance, instructions_sent ? 1 : 0, req.params.id],
                    (err) => {
                        if (err) throw err;
                        res.redirect("/dashboard");
                    }
                );
            }
        );
    });

    // Delete rider
    router.get("/:id/delete", isAuthenticated, (req, res) => {
        db.get(
            "SELECT COUNT(*) AS paymentCount FROM payments WHERE rider_id = ?",
            [req.params.id],
            (err, result) => {
                if (err) throw err;
                if (result.paymentCount > 0) {
                    return res.redirect("/dashboard");
                }
                db.run(
                    "DELETE FROM riders WHERE id = ?",
                    [req.params.id],
                    (err) => {
                        if (err) throw err;
                        res.redirect("/dashboard");
                    }
                );
            }
        );
    });

    // View rider payments
    router.get("/:id/payments", isAuthenticated, (req, res) => {
        db.get(
            "SELECT * FROM riders WHERE id = ?",
            [req.params.id],
            (err, rider) => {
                if (err) throw err;
                db.all(
                    "SELECT * FROM payments WHERE rider_id = ?",
                    [req.params.id],
                    (err, payments) => {
                        if (err) throw err;
                        res.render("rider-payments", { rider, payments });
                    }
                );
            }
        );
    });

    return router;
}

module.exports = createRiderRouter;
