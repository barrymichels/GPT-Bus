const express = require('express');
const { isAuthenticated } = require('../middleware/auth');

/**
 * Create router for trip-related routes
 * @param {Object} db - Database connection
 */
function createTripRouter(db) {
    const router = express.Router();

    // List all trips
    router.get("/", isAuthenticated, (req, res) => {
        db.all("SELECT * FROM trips ORDER BY created_at DESC", [], (err, trips) => {
            if (err) throw err;
            res.render("trips", { trips });
        });
    });

    // Add trip form
    router.get("/add", isAuthenticated, (req, res) => {
        res.render("add-trip");
    });

    // Create trip
    router.post("/", isAuthenticated, (req, res) => {
        const { name, start_date, end_date, cost_of_rental, cost_per_seat, total_seats } = req.body;
        if (!name || isNaN(Date.parse(start_date)) || isNaN(parseFloat(cost_of_rental)) || isNaN(parseFloat(cost_per_seat))) {
            return res.redirect("/trips");
        }

        db.run(
            "INSERT INTO trips (name, start_date, end_date, cost_of_rental, cost_per_seat, total_seats) VALUES (?, ?, ?, ?, ?, ?)",
            [name, start_date, end_date, parseFloat(cost_of_rental), parseFloat(cost_per_seat), total_seats],
            (err) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.redirect("/trips");
                }
                res.redirect("/trips");
            }
        );
    });

    // Add riders form
    router.get("/:id/add-riders", isAuthenticated, (req, res) => {
        const tripId = req.params.id;
        if (!tripId) return res.redirect("/trips");

        db.get("SELECT * FROM trips WHERE id = ?", [tripId], (err, trip) => {
            if (err || !trip) return res.redirect("/trips");
            db.all(
                "SELECT * FROM riders WHERE id NOT IN (SELECT rider_id FROM trip_riders WHERE trip_id = ?)",
                [tripId],
                (err, availableRiders) => {
                    if (err) return res.redirect("/trips");
                    res.render("add-trip-riders", { trip, availableRiders });
                }
            );
        });
    });

    // Add riders to trip
    router.post("/:id/add-riders", isAuthenticated, (req, res, next) => {
        const tripId = req.params.id;
        const selectedRiders = req.body.selected_riders;
        const seatsForRider = req.body.seats;
        
        if (!selectedRiders || !tripId) {
            return res.redirect("/trips");
        }
        
        db.get("SELECT * FROM trips WHERE id = ?", [tripId], (err, trip) => {
            if (err || !trip) return res.redirect("/trips");

            let completed = 0;
            const total = Array.isArray(selectedRiders) ? selectedRiders.length : 1;
            const riders = Array.isArray(selectedRiders) ? selectedRiders : [selectedRiders];

            riders.forEach(riderId => {
                const seats = parseInt(seatsForRider[riderId]) || 1;
                const balance = seats * trip.cost_per_seat;
                
                db.run(
                    "INSERT INTO trip_riders (trip_id, rider_id, seats, balance) VALUES (?, ?, ?, ?)",
                    [tripId, riderId, seats, balance],
                    (err) => {
                        completed++;
                        if (completed === total) {
                            res.redirect("/trips");
                        }
                    }
                );
            });
        });
    });

    // Activate trip
    // View trip roster
    router.get("/:id/roster", isAuthenticated, (req, res) => {
        const tripId = req.params.id;
        if (!tripId) return res.redirect("/trips");

        db.get("SELECT * FROM trips WHERE id = ?", [tripId], (err, trip) => {
            if (err || !trip) return res.redirect("/trips");
            
            db.all(
                `SELECT tr.*, r.name, r.email, r.phone 
                 FROM trip_riders tr 
                 JOIN riders r ON tr.rider_id = r.id 
                 WHERE tr.trip_id = ?`, 
                [tripId], 
                (err, riders) => {
                    if (err) return res.redirect("/trips");
                    res.render("trip-roster", { trip, riders });
                }
            );
        });
    });

    router.post("/:id/activate", isAuthenticated, (req, res) => {
        const tripId = req.params.id;
        if (!tripId) return res.redirect("/trips");

        db.serialize(() => {
            db.run("UPDATE trips SET is_active = 0", [], (err) => {
                if (err) return res.redirect("/trips");
                db.run("UPDATE trips SET is_active = 1 WHERE id = ?", [tripId], (err) => {
                    if (err) return res.redirect("/trips");
                    res.redirect("/trips");
                });
            });
        });
    });

    return router;
}

module.exports = createTripRouter;
