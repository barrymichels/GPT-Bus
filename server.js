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

const app = express();
const db = new sqlite3.Database("./db/database.db");

const COST_OF_RENTAL = process.env.COST_OF_RENTAL || 5000;
const COST_PER_SEAT = process.env.COST_PER_SEAT || 130;

// Set up passport
passport.use(
    new LocalStrategy((username, password, done) => {
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

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    db.get("SELECT id, username FROM users WHERE id = ?", [id], (err, row) => {
        if (!row) return done(null, false);
        return done(null, { id: row.id, username: row.username });
    });
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
    session({
        store: new SQLiteStore({
            db: "./db/database.db",
            table: "sessions",
        }),
        secret: process.env.SESSION_SECRET || "my secret",
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 1 week
    })
);
app.use(passport.initialize());
app.use(passport.session());

// Set up Pug
app.set("view engine", "pug");
app.set("views", "./views");

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.get("/", (req, res) => {
    res.redirect("/dashboard");
});

app.get("/login", (req, res) => {
    res.render("login");
});

app.post(
    "/login",
    passport.authenticate("local", {
        successRedirect: "/dashboard",
        failureRedirect: "/login",
    })
);

app.get("/logout", (req, res) => {
    req.logout(() => {
        res.redirect("/login");
    });
});

app.get("/dashboard", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    db.all(
        `
        SELECT riders.*, 
        SUM(payments.amount) AS total_payments,
        (riders.balance - COALESCE(SUM(payments.amount), 0)) AS balance
        FROM riders
        LEFT JOIN payments ON riders.id = payments.rider_id
        GROUP BY riders.id
    `,
        [],
        (err, riders) => {
            if (err) throw err;
            const TOTAL_COLLECTED = riders.reduce(
                (total, rider) => total + rider.total_payments,
                0
            );
            const REMAINING_FUNDS = COST_OF_RENTAL - TOTAL_COLLECTED;
            riders.forEach((rider) => {
                rider.balance = rider.balance.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                });
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
            });
        }
    );
});

// Additional routes for user management
app.get("/change-password", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    res.render("change-password");
});

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

app.get("/add-user", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    res.render("add-user");
});

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

// Routes for riders and payments
app.get("/add-rider", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    res.render("add-rider");
});

app.post("/add-rider", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    const { name, email, phone, seats } = req.body;
    const balance = seats * COST_PER_SEAT; // Assuming COST_PER_SEAT is defined globally
    db.run(
        "INSERT INTO riders (name, email, phone, seats, balance) VALUES (?, ?, ?, ?, ?)",
        [name, email, phone, seats, balance],
        (err) => {
            if (err) throw err;
            res.redirect("/dashboard");
        }
    );
});

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

app.post("/edit-rider/:id", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    const { name, email, phone, seats, balance } = req.body;
    db.run(
        "UPDATE riders SET name = ?, email = ?, phone = ?, seats = ?, balance = ? WHERE id = ?",
        [name, email, phone, seats, balance, req.params.id],
        (err) => {
            if (err) throw err;
            res.redirect("/dashboard");
        }
    );
});

app.get("/delete-rider/:id", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
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
app.get("/rider/:id/payments", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
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

app.get("/add-payment/:riderId", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    res.render("add-payment", { riderId: req.params.riderId });
});

app.post("/add-payment/:riderId", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
    const { date, amount } = req.body;
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
                    const totalPayments = payments.reduce(
                        (total, payment) => total + payment.amount,
                        0
                    );
                    const currentBalance =
                        parseFloat(rider.balance) -
                        (parseFloat(totalPayments) + parseFloat(amount));
                    db.run(
                        "INSERT INTO payments (rider_id, date, amount) VALUES (?, ?, ?)",
                        [req.params.riderId, date, amount],
                        (err) => {
                            if (err) throw err;
                            // Send email to the rider with the receipt
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

                            const riderEmail =
                                rider.email || process.env.EMAIL_USER;

                            const formattedAmount = parseFloat(
                                amount
                            ).toLocaleString("en-US", {
                                style: "currency",
                                currency: "USD",
                            });

                            const formattedCurrentBalance =
                                currentBalance.toLocaleString("en-US", {
                                    style: "currency",
                                    currency: "USD",
                                });

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
                                            <tbody><tr>
                                                <th style="border:1px solid rgb(221,221,221);padding:8px;text-align:left">Description</th>
                                                <th style="border:1px solid rgb(221,221,221);padding:8px;text-align:left">Price</th>
                                            </tr>
                                            <tr>
                                                <td style="border:1px solid rgb(221,221,221);padding:8px">Regional Convention Bus Transport</td>
                                                <td style="border:1px solid rgb(221,221,221);padding:8px">${formattedAmount}</td>
                                            </tr></tbody>
                                        </table>
                                        <div style="margin-top:20px;text-align:right">
                                            <p>Amount Paid: ${formattedAmount}</p>
                                            <p>Current Amount Due: ${formattedCurrentBalance}</p>
                                        </div>
                                        <div style="text-align:center;margin-top:40px">
                                            <p>Thank you!</p>
                                        </div>
                                    </div>
                                `,
                            };

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
            // Redirect to the rider's payment history page, need to fetch riderId from paymentId
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

app.post("/delete-payment/:paymentId", (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/login");
    }
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
                    // Redirect back to the rider's payment history
                    res.redirect(`/rider/${riderId}/payments`);
                }
            );
        }
    );
});

// Ensure all routes are correctly implemented and connected to the corresponding Pug templates.

// Initialize database and start server
const initDbAndStartServer = () => {
    db.serialize(() => {
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

        bcrypt.hash("password123", 10, (err, hash) => {
            if (err) throw err;
            db.run(
                'INSERT OR IGNORE INTO users (id, username, password) VALUES (1, "admin", ?)',
                [hash]
            );
        });

        app.listen(3000, () => {
            console.log("Server running on http://localhost:3000");
        });
    });
};

initDbAndStartServer();
