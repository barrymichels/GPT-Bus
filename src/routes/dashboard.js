const express = require('express');
const { isAuthenticated } = require('../middleware/auth');

function createDashboardRouter(db) {
    const router = express.Router();

    router.get('/', isAuthenticated, (req, res) => {
        // Get active trip first
        db.get("SELECT * FROM trips WHERE is_active = 1", [], (err, activeTrip) => {
            if (err) throw err;
            if (!activeTrip) {
                // Check if there are any trips at all
                db.get("SELECT COUNT(*) as count FROM trips", [], (err, result) => {
                    if (err) throw err;
                    if (result.count === 0) {
                        // No trips exist, redirect to add trip page
                        return res.redirect("/add-trip");
                    } else {
                        // Trips exist but none active, redirect to trips page
                        return res.redirect("/trips");
                    }
                });
                return;
            }

            // Modified query to get riders and payments for active trip
            db.all(
                `SELECT r.*, tr.seats, tr.balance, tr.instructions_sent,
                SUM(p.amount) AS total_payments,
                (tr.balance - COALESCE(SUM(p.amount), 0)) AS balance
                FROM riders r
                INNER JOIN trip_riders tr ON r.id = tr.rider_id
                LEFT JOIN payments p ON tr.trip_id = p.trip_id AND r.id = p.rider_id
                WHERE tr.trip_id = ?
                GROUP BY r.id
                ORDER BY r.name ASC`,
                [activeTrip.id],
                (err, riders) => {
                    if (err) throw err;
                    // Calculate financial summaries
                    const TOTAL_COLLECTED = riders.reduce(
                        (total, rider) => total + (rider.total_payments || 0),
                        0
                    );
                    const REMAINING_FUNDS = activeTrip.cost_of_rental - TOTAL_COLLECTED;
                    const RESERVED_SEATS = riders.reduce(
                        (total, rider) => total + (rider.seats || 0),
                        0
                    );
                    const REMAINING_SEATS = activeTrip.total_seats - RESERVED_SEATS;

                    // Format currency values
                    riders.forEach((rider) => {
                        rider.collected = (rider.total_payments || 0).toLocaleString("en-US", {
                            style: "currency",
                            currency: "USD",
                        });
                    });

                    res.render("dashboard", {
                        riders,
                        activeTrip,
                        COST_OF_RENTAL: activeTrip.cost_of_rental.toLocaleString("en-US", {
                            style: "currency",
                            currency: "USD",
                        }),
                        TOTAL_COLLECTED: TOTAL_COLLECTED.toLocaleString("en-US", {
                            style: "currency",
                            currency: "USD",
                        }),
                        REMAINING_FUNDS: REMAINING_FUNDS.toLocaleString("en-US", {
                            style: "currency",
                            currency: "USD",
                        }),
                        RESERVED_SEATS,
                        REMAINING_SEATS,
                        TOTAL_SEATS: activeTrip.total_seats,
                    });
                }
            );
        });
    });

    return router;
}

module.exports = createDashboardRouter;
