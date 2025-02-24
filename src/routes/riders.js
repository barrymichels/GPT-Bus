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
            `SELECT r.*, tr.seats, tr.balance, tr.instructions_sent 
             FROM riders r
             LEFT JOIN trip_riders tr ON r.id = tr.rider_id
             LEFT JOIN trips t ON tr.trip_id = t.id AND t.is_active = 1
             WHERE r.id = ?`,
            [req.params.id],
            (err, rider) => {
                if (err) throw err;
                if (!rider) return res.redirect("/dashboard");
                
                db.get("SELECT * FROM trips WHERE is_active = 1", [], (err, activeTrip) => {
                    if (err) throw err;
                    res.render("edit-rider", { rider, activeTrip });
                });
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

    // Emergency contacts form
    router.get("/:id/emergency-contacts", isAuthenticated, (req, res) => {
        db.get(
            "SELECT * FROM riders WHERE id = ?",
            [req.params.id],
            (err, rider) => {
                if (err) throw err;
                if (!rider) return res.redirect("/dashboard");

                db.all(`
                    SELECT * FROM emergency_contacts 
                    WHERE rider_id = ?
                    ORDER BY contact_order ASC`, 
                    [req.params.id], 
                    (err, contacts) => {
                        if (err) throw err;
                        res.render("emergency-contacts", { 
                            rider,
                            riderId: rider.id,
                            contact1: contacts && contacts[0] ? contacts[0] : {},
                            contact2: contacts && contacts[1] ? contacts[1] : {},
                            medical_notes: rider.medical_notes
                        });
                    }
                );
            }
        );
    });

    // Process emergency contact updates
    router.post("/:id/emergency-contacts", isAuthenticated, (req, res) => {
        const riderId = req.params.id;
        
        const {
            contact1_name, contact1_relationship, contact1_phone, contact1_other_phone,
            contact2_name, contact2_relationship, contact2_phone, contact2_other_phone,
            medical_notes
        } = req.body;

        // Validate secondary contact if name is provided
        if (contact2_name && (!contact2_relationship || !contact2_phone)) {
            return db.get(
                "SELECT * FROM riders WHERE id = ?",
                [riderId],
                (err, rider) => {
                    if (err) throw err;
                    if (!rider) return res.redirect("/dashboard");

                    db.all(
                        "SELECT * FROM emergency_contacts WHERE rider_id = ? ORDER BY contact_order ASC",
                        [riderId],
                        (err, contacts) => {
                            if (err) throw err;
                            res.render("emergency-contacts", {
                                error: "If providing a secondary contact, both relationship and phone number are required",
                                rider,
                                riderId: rider.id,
                                contact1: {
                                    name: contact1_name,
                                    relationship: contact1_relationship,
                                    phone: contact1_phone,
                                    other_phone: contact1_other_phone
                                },
                                contact2: {
                                    name: contact2_name,
                                    relationship: contact2_relationship,
                                    phone: contact2_phone,
                                    other_phone: contact2_other_phone
                                },
                                medical_notes
                            });
                        }
                    );
                }
            );
        }

        db.serialize(() => {
            // Update medical notes
            db.run(
                "UPDATE riders SET medical_notes = ? WHERE id = ?",
                [medical_notes || null, riderId]
            );

            // Clear existing contacts
            db.run("DELETE FROM emergency_contacts WHERE rider_id = ?", [riderId]);

            // Insert primary contact if provided
            if (contact1_name && contact1_phone) {
                db.run(`
                    INSERT INTO emergency_contacts (
                        rider_id, name, relationship, phone, other_phone, contact_order
                    ) VALUES (?, ?, ?, ?, ?, 1)`,
                    [riderId, contact1_name, contact1_relationship, contact1_phone, contact1_other_phone]
                );
            }

            // Insert secondary contact if provided
            if (contact2_name && contact2_phone) {
                db.run(`
                    INSERT INTO emergency_contacts (
                        rider_id, name, relationship, phone, other_phone, contact_order
                    ) VALUES (?, ?, ?, ?, ?, 2)`,
                    [riderId, contact2_name, contact2_relationship, contact2_phone, contact2_other_phone]
                );
            }
        });

        res.redirect(`/edit-rider/${riderId}`);
    });

    return router;
}

module.exports = createRiderRouter;
