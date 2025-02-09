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
const fs = require('fs');

// Initialize Express app and SQLite database connection
const app = express();
const db = new sqlite3.Database("./db/database.db");

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
            SUM(CASE WHEN p.trip_id = tr.trip_id THEN p.amount ELSE 0 END) AS total_payments,
            (tr.balance - COALESCE(SUM(CASE WHEN p.trip_id = tr.trip_id THEN p.amount ELSE 0 END), 0)) AS balance
            FROM riders r
            INNER JOIN trip_riders tr ON r.id = tr.rider_id
            LEFT JOIN payments p ON r.id = p.rider_id
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

// Process new rider creation
// Calculates initial balance based on number of seats
app.post("/add-rider", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }

    db.get("SELECT * FROM trips WHERE is_active = 1", [], (err, activeTrip) => {
        if (err) throw err;
        if (!activeTrip) {
            return res.redirect("/trips");
        }

        const { name, email, phone, seats, street, city, state, zip } = req.body;
        const balance = seats * activeTrip.cost_per_seat;

        db.serialize(() => {
            db.run(
                "INSERT INTO riders (name, email, phone, street, city, state, zip) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [name, email, phone, street, city, state, zip],
                function (err) {
                    if (err) throw err;
                    const riderId = this.lastID;
                    db.run(
                        "INSERT INTO trip_riders (trip_id, rider_id, seats, balance) VALUES (?, ?, ?, ?)",
                        [activeTrip.id, riderId, seats, balance],
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

// Edit existing rider information
app.get("/edit-rider/:id", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }

    // Get active trip first
    db.get("SELECT * FROM trips WHERE is_active = 1", [], (err, activeTrip) => {
        if (err) throw err;
        if (!activeTrip) {
            return res.redirect("/trips");
        }

        // Get rider and trip_rider info
        db.get(
            `SELECT r.*, tr.seats, tr.balance, tr.instructions_sent 
             FROM riders r 
             LEFT JOIN trip_riders tr ON r.id = tr.rider_id AND tr.trip_id = ?
             WHERE r.id = ?`,
            [activeTrip.id, req.params.id],
            (err, rider) => {
                if (err) throw err;
                res.render("edit-rider", { rider, activeTrip });
            }
        );
    });
});

// Process rider information updates
app.post("/edit-rider/:id", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }

    db.get("SELECT * FROM trips WHERE is_active = 1", [], (err, activeTrip) => {
        if (err) throw err;
        if (!activeTrip) {
            return res.redirect("/trips");
        }

        const {
            name, email, phone, other_phone, street, city, state, zip,
            seats, balance, instructions_sent
        } = req.body;

        db.serialize(() => {
            // Update rider base info
            db.run(
                "UPDATE riders SET name = ?, email = ?, phone = ?, other_phone = ?, street = ?, city = ?, state = ?, zip = ? WHERE id = ?",
                [name, email, phone, other_phone, street, city, state, zip, req.params.id],
                (err) => {
                    if (err) throw err;

                    // Update or insert trip_rider info
                    db.run(`
                        INSERT INTO trip_riders (trip_id, rider_id, seats, balance, instructions_sent)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(trip_id, rider_id) DO UPDATE SET
                        seats = ?, balance = ?, instructions_sent = ?`,
                        [
                            activeTrip.id, req.params.id, seats, balance, instructions_sent ? 1 : 0,
                            seats, balance, instructions_sent ? 1 : 0
                        ],
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

// Delete rider if they have no payments
app.get("/delete-rider/:id/from-trip", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }

    db.get("SELECT * FROM trips WHERE is_active = 1", [], (err, activeTrip) => {
        if (err) throw err;
        if (!activeTrip) return res.redirect("/trips");

        // Only remove from current trip
        db.run(
            "DELETE FROM trip_riders WHERE rider_id = ? AND trip_id = ?",
            [req.params.id, activeTrip.id],
            (err) => {
                if (err) throw err;
                res.redirect("/dashboard");
            }
        );
    });
});

app.get("/delete-rider/:id/complete", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }

    db.serialize(() => {
        // Delete from all related tables in correct order
        db.run("DELETE FROM trip_riders WHERE rider_id = ?", [req.params.id]);
        db.run("DELETE FROM emergency_contacts WHERE rider_id = ?", [req.params.id]);
        db.run("DELETE FROM medical_notes WHERE rider_id = ?", [req.params.id]);
        db.run("DELETE FROM payments WHERE rider_id = ?", [req.params.id]);
        db.run("DELETE FROM riders WHERE id = ?", [req.params.id], (err) => {
            if (err) throw err;
            res.redirect("/dashboard");
        });
    });
});

// Payment Management Routes
// View payment history for a specific rider
app.get("/rider/:id/payments", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    // Get rider details and their payment history
    db.get("SELECT * FROM trips WHERE is_active = 1", [], (err, activeTrip) => {
        if (err) throw err;
        if (!activeTrip) return res.redirect("/trips");

        db.get(
            "SELECT * FROM riders WHERE id = ?",
            [req.params.id],
            (err, rider) => {
                if (err) throw err;
                db.all(
                    "SELECT * FROM payments WHERE rider_id = ? AND trip_id = ?",
                    [req.params.id, activeTrip.id],
                    (err, payments) => {
                        if (err) throw err;
                        res.render("rider-payments", {
                            rider,
                            payments,
                            activeTrip
                        });
                    }
                );
            }
        );
    });
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

    db.get("SELECT * FROM trips WHERE is_active = 1", [], (err, activeTrip) => {
        if (err) throw err;
        if (!activeTrip) {
            return res.redirect("/trips");
        }

        const { date, amount } = req.body;
        // Add trip_id to payments table
        db.run(
            "INSERT INTO payments (rider_id, trip_id, date, amount) VALUES (?, ?, ?, ?)",
            [req.params.riderId, activeTrip.id, date, amount],
            (err) => {
                if (err) throw err;
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
const dbPath = "./db/database.db";

async function initDbAndStartServer() {
    try {
        // Create db directory if it doesn't exist
        if (!fs.existsSync('./db')) {
            fs.mkdirSync('./db');
        }

        // Initialize database connection
        global.db = new sqlite3.Database('./db/database.db');

        db.serialize(() => {
            // Enable foreign keys
            db.run('PRAGMA foreign_keys = ON');

            // Helper function to safely add columns
            function addColumn(table, column, type) {
                return new Promise((resolve, reject) => {
                    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`, (err) => {
                        // Column might already exist, which is fine
                        resolve();
                    });
                });
            }

            // Add new columns to existing tables
            Promise.all([
                addColumn('riders', 'other_phone', 'TEXT DEFAULT ""'),
                addColumn('emergency_contacts', 'relationship', 'TEXT DEFAULT ""'),
                addColumn('emergency_contacts', 'other_phone', 'TEXT DEFAULT ""'),
                addColumn('payments', 'trip_id', 'INTEGER REFERENCES trips(id)')
            ]).then(() => {
                console.log('Schema updates completed');
            });

            // Create tables only if they don't exist
            console.log('Checking/creating database tables...');

            // Create users and sessions tables
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY,
                    username TEXT UNIQUE,
                    password TEXT
                )
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS sessions (
                    sid TEXT PRIMARY KEY,
                    sess TEXT,
                    expired INTEGER
                )
            `);

            // Create riders table
            db.run(`
                CREATE TABLE IF NOT EXISTS riders (
                    id INTEGER PRIMARY KEY,
                    name TEXT,
                    email TEXT,
                    phone TEXT,
                    other_phone TEXT DEFAULT '',
                    street TEXT DEFAULT '',
                    city TEXT DEFAULT '',
                    state TEXT DEFAULT '',
                    zip TEXT DEFAULT ''
                )
            `);

            // Create trips and trip_riders tables
            db.run(`
                CREATE TABLE IF NOT EXISTS trips (
                    id INTEGER PRIMARY KEY,
                    name TEXT,
                    start_date TEXT,
                    end_date TEXT,
                    cost_of_rental REAL,
                    cost_per_seat REAL,
                    total_seats INTEGER,
                    is_active BOOLEAN DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS trip_riders (
                    trip_id INTEGER,
                    rider_id INTEGER,
                    seats INTEGER,
                    balance INTEGER,
                    instructions_sent BOOLEAN DEFAULT 0,
                    FOREIGN KEY(trip_id) REFERENCES trips(id),
                    FOREIGN KEY(rider_id) REFERENCES riders(id),
                    PRIMARY KEY(trip_id, rider_id)
                )
            `);

            // Create payments table
            db.run(`
                CREATE TABLE IF NOT EXISTS payments (
                    id INTEGER PRIMARY KEY,
                    rider_id INTEGER,
                    trip_id INTEGER,
                    date TEXT,
                    amount INTEGER,
                    FOREIGN KEY(rider_id) REFERENCES riders(id),
                    FOREIGN KEY(trip_id) REFERENCES trips(id)
                )
            `);

            // Create emergency contacts and medical notes tables
            db.run(`
                CREATE TABLE IF NOT EXISTS emergency_contacts (
                    id INTEGER PRIMARY KEY,
                    rider_id INTEGER,
                    contact_order INTEGER,
                    name TEXT,
                    relationship TEXT DEFAULT '',
                    phone TEXT,
                    other_phone TEXT DEFAULT '',
                    FOREIGN KEY(rider_id) REFERENCES riders(id)
                )
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS medical_notes (
                    rider_id INTEGER PRIMARY KEY,
                    notes TEXT,
                    FOREIGN KEY(rider_id) REFERENCES riders(id)
                )
            `);

            // Create default admin user if none exists
            db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
                if (err) {
                    console.error('Error checking users table:', err);
                    return;
                }
                if (row.count === 0) {
                    console.log('Creating default admin user...');
                    bcrypt.hash("password123", 10, (err, hash) => {
                        if (err) {
                            console.error('Error creating admin user:', err);
                            return;
                        }
                        db.run(
                            'INSERT INTO users (username, password) VALUES ("admin", ?)',
                            [hash],
                            (err) => {
                                if (err) {
                                    console.error('Error inserting admin user:', err);
                                    return;
                                }
                                console.log('Default admin user created.');
                            }
                        );
                    });
                }
            });
        });

        // Start the server
        app.listen(3000, () => {
            console.log("Server running on http://localhost:3000");
        });

    } catch (err) {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    }
}

// Add new routes for trip management
// Display trips list
app.get("/trips", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    db.all("SELECT * FROM trips ORDER BY created_at DESC", [], (err, trips) => {
        if (err) throw err;
        res.render("trips", { trips });
    });
});

// Add new trip form
app.get("/add-trip", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    res.render("add-trip");
});

// Process new trip creation
app.post("/add-trip", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    const { name, start_date, end_date, cost_of_rental, cost_per_seat, total_seats } = req.body;
    db.run(
        "INSERT INTO trips (name, start_date, end_date, cost_of_rental, cost_per_seat, total_seats) VALUES (?, ?, ?, ?, ?, ?)",
        [name, start_date, end_date, parseFloat(cost_of_rental), parseFloat(cost_per_seat), total_seats],
        (err) => {
            if (err) throw err;
            res.redirect("/trips");
        }
    );
});

// Set active trip
app.post("/trip/:id/activate", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    db.serialize(() => {
        db.run("UPDATE trips SET is_active = 0");
        db.run("UPDATE trips SET is_active = 1 WHERE id = ?", [req.params.id], (err) => {
            if (err) throw err;
            res.redirect("/trips");
        });
    });
});

// Add new route to handle emergency contact form submission
app.post("/rider/:id/emergency-contacts", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }

    const riderId = req.params.id;
    const {
        contact1_name, contact1_relationship, contact1_phone, contact1_other_phone,
        contact2_name, contact2_relationship, contact2_phone, contact2_other_phone,
        medical_notes
    } = req.body;

    db.serialize(() => {
        // Delete existing contacts
        db.run("DELETE FROM emergency_contacts WHERE rider_id = ?", [riderId]);

        // Insert primary contact
        db.run(
            "INSERT INTO emergency_contacts (rider_id, contact_order, name, relationship, phone, other_phone) VALUES (?, 1, ?, ?, ?, ?)",
            [riderId, contact1_name, contact1_relationship, contact1_phone, contact1_other_phone]
        );

        // Insert secondary contact if provided
        if (contact2_name || contact2_phone) {
            db.run(
                "INSERT INTO emergency_contacts (rider_id, contact_order, name, relationship, phone, other_phone) VALUES (?, 2, ?, ?, ?, ?)",
                [riderId, contact2_name, contact2_relationship, contact2_phone, contact2_other_phone]
            );
        }

        // Update medical notes
        db.run("INSERT OR REPLACE INTO medical_notes (rider_id, notes) VALUES (?, ?)",
            [riderId, medical_notes]
        );

        res.redirect(`/edit-rider/${riderId}`);
    });
});

// Add route to get emergency contacts
app.get("/rider/:id/emergency-contacts", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }

    const riderId = req.params.id;
    db.serialize(() => {
        db.all("SELECT * FROM emergency_contacts WHERE rider_id = ? ORDER BY contact_order", [riderId], (err, contacts) => {
            if (err) throw err;
            db.get("SELECT notes FROM medical_notes WHERE rider_id = ?", [riderId], (err, medical) => {
                if (err) throw err;
                res.render("emergency-contacts", {
                    riderId,
                    contact1: contacts.find(c => c.contact_order === 1) || {},
                    contact2: contacts.find(c => c.contact_order === 2) || {},
                    medical_notes: medical ? medical.notes : ''
                });
            });
        });
    });
});

// Add route to show available riders for a trip
app.get("/trip/:id/add-riders", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }

    const tripId = req.params.id;

    db.serialize(() => {
        // Get trip info
        db.get("SELECT * FROM trips WHERE id = ?", [tripId], (err, trip) => {
            if (err) throw err;

            // Get riders not already in this trip
            db.all(`
                SELECT * FROM riders 
                WHERE id NOT IN (
                    SELECT rider_id FROM trip_riders WHERE trip_id = ?
                )
                ORDER BY name
            `, [tripId], (err, availableRiders) => {
                if (err) throw err;
                res.render("add-trip-riders", { trip, availableRiders });
            });
        });
    });
});

// Process adding existing riders to a trip
app.post("/trip/:id/add-riders", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }

    const tripId = parseInt(req.params.id);
    const selected_riders = req.body.selected_riders || {};

    db.get("SELECT * FROM trips WHERE id = ?", [tripId], (err, trip) => {
        if (err) {
            return res.redirect("/dashboard");
        }

        if (!trip) {
            return res.redirect("/dashboard");
        }

        const riderIds = Object.keys(selected_riders)
            .map(key => parseInt(selected_riders[key]))
            .filter(id => !isNaN(id));

        if (riderIds.length === 0) {
            return res.redirect("/dashboard");
        }

        const placeholders = riderIds.map(() => '?').join(',');
        db.all(
            `SELECT * FROM riders WHERE id IN (${placeholders})`,
            riderIds,
            (err, validRiders) => {
                if (err) {
                    return res.redirect("/dashboard");
                }

                const ridersToAdd = validRiders.map(rider => ({
                    id: rider.id,
                    seats: parseInt(req.body.seats[rider.id] || 1)
                }));

                if (ridersToAdd.length === 0) {
                    return res.redirect("/dashboard");
                }

                db.serialize(() => {
                    db.run("BEGIN TRANSACTION");

                    let success = true;
                    ridersToAdd.forEach(rider => {
                        const balance = rider.seats * trip.cost_per_seat;
                        db.run(
                            "INSERT INTO trip_riders (trip_id, rider_id, seats, balance) VALUES (?, ?, ?, ?)",
                            [tripId, rider.id, rider.seats, balance],
                            err => {
                                if (err) success = false;
                            }
                        );
                    });

                    if (success) {
                        db.run("COMMIT", () => res.redirect("/dashboard"));
                    } else {
                        db.run("ROLLBACK", () => res.redirect("/dashboard"));
                    }
                });
            }
        );
    });
});

// Add roster export route
app.get("/trip/:id/roster", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }

    const tripId = parseInt(req.params.id);

    db.serialize(() => {
        db.get("SELECT * FROM trips WHERE id = ?", [tripId], (err, trip) => {
            if (err) throw err;

            const query = `
                SELECT 
                    r.name, r.phone, r.other_phone,
                    ec1.name as contact1_name, ec1.relationship as contact1_relationship,
                    ec1.phone as contact1_phone, ec1.other_phone as contact1_other_phone,
                    ec2.name as contact2_name, ec2.relationship as contact2_relationship,
                    ec2.phone as contact2_phone, ec2.other_phone as contact2_other_phone,
                    mn.notes as medical_notes
                FROM riders r
                INNER JOIN trip_riders tr ON r.id = tr.rider_id
                LEFT JOIN (
                    SELECT * FROM emergency_contacts WHERE contact_order = 1
                ) ec1 ON r.id = ec1.rider_id
                LEFT JOIN (
                    SELECT * FROM emergency_contacts WHERE contact_order = 2
                ) ec2 ON r.id = ec2.rider_id
                LEFT JOIN medical_notes mn ON r.id = mn.rider_id
                WHERE tr.trip_id = ?
                ORDER BY r.name ASC
            `;

            db.all(query, [tripId], (err, riders) => {
                if (err) throw err;

                const formattedRiders = riders.map(rider => ({
                    name: rider.name,
                    phone: rider.phone,
                    other_phone: rider.other_phone,
                    contact1: rider.contact1_name ? {
                        name: rider.contact1_name,
                        relationship: rider.contact1_relationship,
                        phone: rider.contact1_phone,
                        other_phone: rider.contact1_other_phone
                    } : null,
                    contact2: rider.contact2_name ? {
                        name: rider.contact2_name,
                        relationship: rider.contact2_relationship,
                        phone: rider.contact2_phone,
                        other_phone: rider.contact2_other_phone
                    } : null,
                    medical_notes: rider.medical_notes || ''
                }));

                res.render("trip-roster", { trip, riders: formattedRiders });
            });
        });
    });
});

initDbAndStartServer();
