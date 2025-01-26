// Main server configuration file for a bus rental payment tracking system
// This application manages riders, payments, and user authentication
// Environment variables are loaded from .env file for configuration

require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3");
const path = require("path");
const nodemailer = require("nodemailer");

// Initialize Express app and SQLite database connection
const app = express();
const db = new sqlite3.Database("./db/database.db");

// Constants for business logic - can be overridden by environment variables
const COST_OF_RENTAL = process.env.COST_OF_RENTAL || 5000;  // Total cost to rent the bus
const COST_PER_SEAT = process.env.COST_PER_SEAT || 130;     // Cost per seat for each rider
const TOTAL_SEATS = process.env.TOTAL_SEATS || 50;          // Total seats available on the bus

// Passport authentication configuration
// Uses local strategy with username/password stored in SQLite
// Passwords are hashed using bcrypt for security
passport.use(
    new LocalStrategy((username, password, done) => {
        // Query database for user with matching username
        // Compare password hash using bcrypt
        db.get(
            "SELECT id, username, password FROM users WHERE username = ?",
            [username],
            (err, row) => {
                if (err) return done(err);
                if (!row)
                    return done(null, false, {
                        message: "Incorrect username.",
                    });
                bcrypt.compare(password, row.password, (err, res) => {
                    if (res)
                        return done(null, {
                            id: row.id,
                            username: row.username,
                        });
                    return done(null, false, {
                        message: "Incorrect password.",
                    });
                });
            }
        );
    })
);

// Serialize user for the session - stores only user ID in session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialize user from session - retrieves full user object using ID
passport.deserializeUser((id, done) => {
    db.get("SELECT id, username FROM users WHERE id = ?", [id], (err, row) => {
        if (!row) return done(null, false);
        return done(null, { id: row.id, username: row.username });
    });
});

// Express middleware configuration
// - Enables parsing of URL-encoded bodies and JSON
// - Sets up session handling with SQLite storage
// - Initializes passport authentication
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
    session({
        store: new SQLiteStore({  // Store sessions in SQLite database
            db: "./db/database.db",
            table: "sessions",
        }),
        secret: process.env.SESSION_SECRET || "my secret",  // Secret used to sign session ID cookie
        resave: false,  // Don't save session if unmodified
        saveUninitialized: false,  // Don't create session until something stored
        cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // Session expires in 1 week
    })
);
app.use(passport.initialize());
app.use(passport.session());

// View engine setup using Pug templating
app.set("view engine", "pug");
app.set("views", "./views");

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")));

// Authentication Routes
// GET / - Redirects to dashboard
app.get("/", (req, res) => {
    res.redirect("/dashboard");
});

// Login routes - handles both display and processing of login form
app.get("/login", (req, res) => {
    res.render("login");
});

// Process login form submission using passport authentication
app.post(
    "/login",
    passport.authenticate("local", {
        successRedirect: "/dashboard",  // Redirect to dashboard on success
        failureRedirect: "/login",      // Return to login page on failure
    })
);

// Logout route - destroys session and redirects to login
app.get("/logout", (req, res) => {
    req.logout(() => {
        res.redirect("/login");
    });
});

// Dashboard route - Main application view
// Shows all riders and their payment status
// Calculates total collections and remaining funds
app.get("/dashboard", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    // Complex SQL query to get riders and their payment totals
    // Calculates remaining balance for each rider
    db.all(
        `
        SELECT riders.*, 
        SUM(payments.amount) AS total_payments,
        (riders.balance - COALESCE(SUM(payments.amount), 0)) AS balance
        FROM riders
        LEFT JOIN payments ON riders.id = payments.rider_id
        GROUP BY riders.id
        ORDER BY riders.name ASC
    `,
        [],
        (err, riders) => {
            if (err) throw err;
            // Calculate financial summaries
            const TOTAL_COLLECTED = riders.reduce(
                (total, rider) => total + rider.total_payments,
                0
            );
            const REMAINING_FUNDS = COST_OF_RENTAL - TOTAL_COLLECTED;
            // Calculate seat statistics
            const RESERVED_SEATS = riders.reduce(
                (total, rider) => total + (rider.seats || 0),
                0
            );
            const REMAINING_SEATS = TOTAL_SEATS - RESERVED_SEATS;
            // Format currency values for display
            riders.forEach((rider) => {
                rider.collected = rider.total_payments
                    ? rider.total_payments.toLocaleString("en-US", {
                          style: "currency",
                          currency: "USD",
                      })
                    : "$0.00";
            });
            res.render("dashboard", {
                riders,
                COST_OF_RENTAL: COST_OF_RENTAL.toLocaleString("en-US", {
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
                TOTAL_SEATS,
            });
        }
    );
});

// User Management Routes
// Change password functionality for logged-in users
app.get("/change-password", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    res.render("change-password");
});

// Process password change request
// Hashes new password before storing in database
app.post("/change-password", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
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

// Add new user form display
app.get("/add-user", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    res.render("add-user");
});

// Process new user creation
// Hashes password and stores user in database
app.post("/add-user", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
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

// Rider Management Routes
// Display form to add new rider
app.get("/add-rider", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    res.render("add-rider");
});

// Process new rider creation
// Calculates initial balance based on number of seats
app.post("/add-rider", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    const { name, email, phone, seats, street, city, state, zip, instructions_sent } = req.body;
    const balance = seats * COST_PER_SEAT;  // Calculate total cost based on seats
    db.run(
        "INSERT INTO riders (name, email, phone, seats, balance, street, city, state, zip, instructions_sent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [name, email, phone, seats, balance, street, city, state, zip, instructions_sent ? 1 : 0],
        (err) => {
            if (err) throw err;
            res.redirect("/dashboard");
        }
    );
});

// Edit existing rider information
app.get("/edit-rider/:id", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    db.get(
        "SELECT * FROM riders WHERE id = ?",
        [req.params.id],
        (err, rider) => {
            if (err) throw err;
            res.render("edit-rider", { rider });
        }
    );
});

// Process rider information updates
app.post("/edit-rider/:id", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    const { name, email, phone, seats, balance, street, city, state, zip, instructions_sent } = req.body;
    db.run(
        "UPDATE riders SET name = ?, email = ?, phone = ?, seats = ?, balance = ?, street = ?, city = ?, state = ?, zip = ?, instructions_sent = ? WHERE id = ?",
        [name, email, phone, seats, balance, street, city, state, zip, instructions_sent ? 1 : 0, req.params.id],
        (err) => {
            if (err) throw err;
            res.redirect("/dashboard");
        }
    );
});

// Delete rider if they have no payments
app.get("/delete-rider/:id", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    // Check if rider has any payments before deletion
    db.get(
        "SELECT COUNT(*) AS paymentCount FROM payments WHERE rider_id = ?",
        [req.params.id],
        (err, result) => {
            if (err) throw err;
            if (result.paymentCount > 0) {
                return res.redirect("/dashboard");  // Can't delete if payments exist
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

// Payment Management Routes
// View payment history for a specific rider
app.get("/rider/:id/payments", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    // Get rider details and their payment history
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

// Display form to add new payment
app.get("/add-payment/:riderId", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    res.render("add-payment", { riderId: req.params.riderId });
});

// Process new payment and send email receipt
app.post("/add-payment/:riderId", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    const { date, amount } = req.body;
    // Get rider information and payment history
    db.get(
        "SELECT * FROM riders WHERE id = ?",
        [req.params.riderId],
        (err, rider) => {
            if (err) throw err;
            db.all(
                "SELECT * FROM payments WHERE rider_id = ?",
                [req.params.riderId],
                (err, payments) => {
                    if (err) throw err;
                    // Calculate total payments including new payment
                    const totalPayments = payments.reduce(
                        (total, payment) => total + parseFloat(payment.amount),
                        0
                    );
                    const currentBalance = parseFloat(totalPayments) + parseFloat(amount);
                    
                    // Insert new payment record
                    db.run(
                        "INSERT INTO payments (rider_id, date, amount) VALUES (?, ?, ?)",
                        [req.params.riderId, date, amount],
                        (err) => {
                            if (err) throw err;
                            
                            // Configure email transport
                            const transporter = nodemailer.createTransport({
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

                            // Format payment amounts for email
                            const riderEmail = rider.email || process.env.EMAIL_USER;
                            const formattedAmount = parseFloat(amount).toLocaleString("en-US", {
                                style: "currency",
                                currency: "USD",
                            });
                            const formattedCurrentBalance = currentBalance.toLocaleString("en-US", {
                                style: "currency",
                                currency: "USD",
                            });

                            // Generate HTML table of payment history
                            const paymentTable = payments
                                .map(
                                    (payment) =>
                                        `<tr>
                                            <td style="border:1px solid rgb(221,221,221);padding:8px">${payment.date}</td>
                                            <td style="border:1px solid rgb(221,221,221);padding:8px">${parseFloat(
                                                payment.amount
                                            ).toLocaleString("en-US", {
                                                style: "currency",
                                                currency: "USD",
                                            })}</td>
                                        </tr>`
                                )
                                .join("");

                            // Configure and send email receipt
                            const mailOptions = {
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
                                `,
                            };

                            // Send email and handle response
                            transporter.sendMail(mailOptions, (error, info) => {
                                if (error) {
                                    console.log(error);
                                } else {
                                    console.log("Email sent: " + info.response);
                                }
                            });

                            res.redirect(
                                `/rider/${req.params.riderId}/payments`
                            );
                        }
                    );
                }
            );
        }
    );
});

// Edit existing payment
app.get("/edit-payment/:paymentId", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    db.get(
        "SELECT * FROM payments WHERE id = ?",
        [req.params.paymentId],
        (err, payment) => {
            if (err) throw err;
            res.render("edit-payment", { payment, riderId: payment.rider_id });
        }
    );
});

// Process payment updates
app.post("/edit-payment/:paymentId", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    const { date, amount } = req.body;
    db.run(
        "UPDATE payments SET date = ?, amount = ? WHERE id = ?",
        [date, amount, req.params.paymentId],
        (err) => {
            if (err) throw err;
            // Get rider ID to redirect back to payment history
            db.get(
                "SELECT rider_id FROM payments WHERE id = ?",
                [req.params.paymentId],
                (err, row) => {
                    if (err) throw err;
                    res.redirect(`/rider/${row.rider_id}/payments`);
                }
            );
        }
    );
});

// Delete payment record
app.post("/delete-payment/:paymentId", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    // Get rider ID before deleting payment for redirect
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
                    res.redirect(`/rider/${riderId}/payments`);
                }
            );
        }
    );
});

// Database Initialization and Server Startup
// Creates necessary tables if they don't exist
// Handles database schema migrations for new columns
// Creates default admin user if none exists
const initDbAndStartServer = () => {
    db.serialize(() => {
        // Check existing table schema and add new columns if needed
        db.all("PRAGMA table_info(riders)", [], (err, rows) => {
            if (err) {
                console.error('Error checking table schema:', err);
                return;
            }

            // Helper function to check if column exists
            const columnExists = (columnName) => {
                return rows.some(row => row.name === columnName);
            };

            // Add new columns if they don't exist
            const migrations = [
                !columnExists('street') ? "ALTER TABLE riders ADD COLUMN street TEXT DEFAULT '';" : null,
                !columnExists('city') ? "ALTER TABLE riders ADD COLUMN city TEXT DEFAULT '';" : null,
                !columnExists('state') ? "ALTER TABLE riders ADD COLUMN state TEXT DEFAULT '';" : null,
                !columnExists('zip') ? "ALTER TABLE riders ADD COLUMN zip TEXT DEFAULT '';" : null,
                !columnExists('instructions_sent') ? "ALTER TABLE riders ADD COLUMN instructions_sent BOOLEAN DEFAULT 0;" : null
            ].filter(Boolean);

            // Execute migrations sequentially
            migrations.forEach(migration => {
                db.run(migration, (err) => {
                    if (err) console.error('Migration error:', err);
                });
            });
        });

        // Create core database tables
        db.run(
            "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, password TEXT)"
        );
        db.run(
            "CREATE TABLE IF NOT EXISTS riders (id INTEGER PRIMARY KEY, name TEXT, email TEXT, phone TEXT, seats INTEGER, balance INTEGER)"
        );
        db.run(
            "CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY, rider_id INTEGER, date TEXT, amount INTEGER)"
        );
        db.run(
            "CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, session TEXT, expire INTEGER)"
        );

        // Create default admin user with password 'password123'
        bcrypt.hash("password123", 10, (err, hash) => {
            if (err) throw err;
            db.run(
                'INSERT OR IGNORE INTO users (id, username, password) VALUES (1, "admin", ?)',
                [hash]
            );
        });

        // Start the server
        app.listen(3000, () => {
            console.log("Server running on http://localhost:3000");
        });
    });
};

initDbAndStartServer();
