const express = require('express');
const { isAuthenticated } = require('../middleware/auth');

/**
 * Create router for payment-related routes
 * @param {Object} db - Database connection
 */
function createPaymentRouter(db, emailService) {
    const router = express.Router();

    // Payment history
    router.get('/history/:id', isAuthenticated, (req, res) => {
        try {
            db.get(
                "SELECT * FROM riders WHERE id = ?",
                [req.params.id],
                (err, rider) => {
                    if (err) {
                        console.error('Database error:', err);
                        return res.status(500).send('Error retrieving rider');
                    }
                    if (!rider) {
                        return res.status(404).send('Rider not found');
                    }
                    db.all(
                        "SELECT p.*, t.id as trip_id FROM payments p JOIN trips t ON p.trip_id = t.id WHERE p.rider_id = ? AND t.is_active = 1",
                        [req.params.id],
                        (err, payments) => {
                            if (err) {
                                console.error('Database error:', err);
                                return res.status(500).send('Error retrieving payments');
                            }
                            res.render("rider-payments", { rider, payments });
                        }
                    );
                }
            );
        } catch (err) {
            console.error('Server error:', err);
            res.status(500).send('Internal server error');
        }
    });

    // Add payment form
    router.get('/add/:riderId', isAuthenticated, (req, res) => {
        res.render("add-payment", { riderId: req.params.riderId });
    });

    // Process new payment
    router.post('/add/:riderId', isAuthenticated, (req, res) => {
        try {
            const { date, amount } = req.body;
            
            db.get("SELECT * FROM trips WHERE is_active = 1", [], (err, activeTrip) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).send('Error retrieving active trip');
                }
                if (!activeTrip) {
                    return res.status(404).send('No active trip found');
                }

                db.run(
                    "INSERT INTO payments (rider_id, trip_id, date, amount) VALUES (?, ?, ?, ?)",
                    [req.params.riderId, activeTrip.id, date, amount],
                    function(err) {
                        if (err) {
                            console.error('Database error:', err);
                            return res.status(500).send('Error creating payment');
                        }

                        // Look up rider and payment history, then send receipt
                        db.get("SELECT * FROM riders WHERE id = ?", [req.params.riderId], (err, rider) => {
                            if (err || !rider || !rider.email) {
                                console.error('Could not retrieve rider email:', err);
                                req.flash('warning', 'Payment added but could not send receipt email');
                                return res.redirect(`/rider/${req.params.riderId}/payments`);
                            }

                            db.all(
                                "SELECT p.* FROM payments p WHERE p.rider_id = ? AND p.trip_id = ? AND p.id != last_insert_rowid()",
                                [req.params.riderId, activeTrip.id],
                                (err, payments) => {
                                    emailService.sendReceiptEmail(rider.email, {
                                        riderName: rider.name,
                                        date,
                                        amount,
                                        payments: err ? [] : payments
                                    })
                                    .then(() => {
                                        req.flash('success', 'Payment added and receipt emailed');
                                        res.redirect(`/rider/${req.params.riderId}/payments`);
                                    })
                                    .catch(err => {
                                        console.error('Email error:', err);
                                        req.flash('warning', 'Payment added but email failed to send');
                                        res.redirect(`/rider/${req.params.riderId}/payments`);
                                    });
                                }
                            );
                        });
                    }
                );
            });
        } catch (err) {
            console.error('Server error:', err);
            res.status(500).send('Internal server error');
        }
    });

    // Edit payment form
    router.get('/edit/:paymentId', isAuthenticated, (req, res) => {
        db.get(
            "SELECT * FROM payments WHERE id = ?",
            [req.params.paymentId],
            (err, payment) => {
                if (err) throw err;
                res.render("edit-payment", { payment, riderId: payment.rider_id });
            }
        );
    });

    // Update payment
    router.post('/edit/:paymentId', isAuthenticated, (req, res) => {
        const { date, amount } = req.body;
        db.run(
            "UPDATE payments SET date = ?, amount = ? WHERE id = ?",
            [date, amount, req.params.paymentId],
            (err) => {
                if (err) throw err;
                db.get(
                    "SELECT rider_id FROM payments WHERE id = ?",
                    [req.params.paymentId],
                    (err, row) => {
                        if (err) throw err;
                        req.flash('success', 'Payment updated');
                        res.redirect(`/rider/${row.rider_id}/payments`);
                    }
                );
            }
        );
    });

    // Delete payment
    router.post('/delete/:paymentId', isAuthenticated, (req, res) => {
        db.get(
            "SELECT rider_id FROM payments WHERE id = ?",
            [req.params.paymentId],
            (err, row) => {
                if (err) throw err;
                const riderId = row.rider_id;
                db.run(
                    "DELETE FROM payments WHERE id = ?",
                    [req.params.paymentId],
                    (err) => {
                        if (err) throw err;
                        req.flash('success', 'Payment deleted');
                        res.redirect(`/rider/${riderId}/payments`);
                    }
                );
            }
        );
    });

    return router;
}

module.exports = createPaymentRouter;
