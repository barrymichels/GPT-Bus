const express = require('express');
const nodemailer = require('nodemailer');
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

                        // Send email with the correct parameters
                        emailService.sendReceiptEmail(
                            req.params.riderId,
                            date,  // Pass the date from request body
                            amount,  // Pass the amount from request body
                            activeTrip.id
                        )
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

// Helper function to send payment receipt
async function sendPaymentReceipt(db, riderId, date, amount, tripId) {
    return new Promise((resolve, reject) => {
        db.get(
            "SELECT * FROM riders WHERE id = ?",
            [riderId],
            (err, rider) => {
                if (err) return reject(err);
                db.all(
                    "SELECT p.*, t.id as trip_id FROM payments p JOIN trips t ON p.trip_id = t.id WHERE p.rider_id = ? AND t.is_active = 1",
                    [riderId],
                    (err, payments) => {
                        if (err) return reject(err);
                        
                        const totalPayments = payments
                            .filter(payment => payment.trip_id === tripId)
                            .reduce(
                                (total, payment) => total + parseFloat(payment.amount),
                                0
                            );
                        const currentBalance = parseFloat(totalPayments) + parseFloat(amount);

                        const transporter = process.env.NODE_ENV === "test"
                            ? nodemailer.createTransport({
                                streamTransport: true,
                                newline: "unix",
                                buffer: true,
                            })
                            : nodemailer.createTransport({
                                host: process.env.EMAIL_HOST,
                                port: process.env.EMAIL_PORT,
                                secure: false,
                                auth: {
                                    user: process.env.EMAIL_USER,
                                    pass: process.env.EMAIL_PASS,
                                },
                                tls: {
                                    ciphers: "SSLv3",
                                },
                            });

                        const mailOptions = generateEmailOptions(rider, date, amount, payments, currentBalance);
                        
                        transporter.sendMail(mailOptions, (error, info) => {
                            transporter.close();
                            if (error && process.env.NODE_ENV !== "test") {
                                console.error('Email error:', error);
                            }
                            resolve();
                        });
                    }
                );
            }
        );
    });
}

// Helper function to generate email options
function generateEmailOptions(rider, date, amount, payments, currentBalance) {
    const riderEmail = rider.email || process.env.EMAIL_USER;
    const formattedAmount = parseFloat(amount).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
    });
    const formattedCurrentBalance = currentBalance.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
    });

    const paymentTable = payments
        .map(payment => `
            <tr>
                <td style="border:1px solid rgb(221,221,221);padding:8px">${payment.date}</td>
                <td style="border:1px solid rgb(221,221,221);padding:8px">${
                    parseFloat(payment.amount).toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                    })
                }</td>
            </tr>
        `)
        .join("");

    return {
        from: process.env.EMAIL_USER,
        to: riderEmail,
        subject: "Payment Receipt",
        html: `
            <div style="width:80%;max-width:600px;margin:40px auto;padding:20px;border:1px solid rgb(221,221,221)">
                <div>
                    <h2>Receipt</h2>
                    <p>Name: ${rider.name}</p>
                    <p>Date: ${date}</p>
                </div>
                <table style="width:100%;border-collapse:collapse;margin-top:20px">
                    <tbody>
                        <tr>
                            <th style="border:1px solid rgb(221,221,221);padding:8px;text-align:left">Date</th>
                            <th style="border:1px solid rgb(221,221,221);padding:8px;text-align:left">Amount</th>
                        </tr>
                        ${paymentTable}
                        <tr>
                            <td style="border:1px solid rgb(221,221,221);padding:8px">${date}</td>
                            <td style="border:1px solid rgb(221,221,221);padding:8px">${formattedAmount}</td>
                        </tr>
                    </tbody>
                </table>
                <div style="margin-top:20px;text-align:right">
                    <p>Amount Paid to Date: ${formattedCurrentBalance}</p>
                </div>
                <div style="text-align:center;margin-top:40px">
                    <p>Thank you!</p>
                </div>
            </div>
        `
    };
}

module.exports = createPaymentRouter;
