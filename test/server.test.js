jest.setTimeout(5000);

const request = require("supertest");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const { createServer } = require("../server");
const assert = require("assert");

describe("Server Routes", function() {
  let app;
  let db;
  let agent;

  beforeAll((done) => {
    // Create in-memory database
    db = new sqlite3.Database(":memory:");
    db.serialize(() => {
      // Create tables
      db.run(`CREATE TABLE users (
                id INTEGER PRIMARY KEY,
                username TEXT UNIQUE,
                password TEXT
              )`);
      
      db.run(`CREATE TABLE sessions (
                sid TEXT PRIMARY KEY,
                sess TEXT,
                expired INTEGER
              )`);

      db.run(`CREATE TABLE trips (
                id INTEGER PRIMARY KEY,
                name TEXT,
                start_date TEXT,
                end_date TEXT,
                cost_of_rental REAL,
                cost_per_seat REAL,
                total_seats INTEGER,
                is_active BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
              )`);

      db.run(`CREATE TABLE riders (
                id INTEGER PRIMARY KEY,
                name TEXT,
                email TEXT,
                phone TEXT,
                street TEXT DEFAULT '',
                city TEXT DEFAULT '',
                state TEXT DEFAULT '',
                zip TEXT DEFAULT ''
              )`);

      db.run(`CREATE TABLE trip_riders (
                trip_id INTEGER,
                rider_id INTEGER,
                seats INTEGER,
                balance INTEGER,
                instructions_sent BOOLEAN DEFAULT 0,
                FOREIGN KEY(trip_id) REFERENCES trips(id),
                FOREIGN KEY(rider_id) REFERENCES riders(id),
                PRIMARY KEY(trip_id, rider_id)
              )`);

      db.run(`CREATE TABLE payments (
        id INTEGER PRIMARY KEY,
        rider_id INTEGER,
        trip_id INTEGER,
        date TEXT,
        amount INTEGER,
        FOREIGN KEY(rider_id) REFERENCES riders(id),
        FOREIGN KEY(trip_id) REFERENCES trips(id)
      )`);

      // Insert default admin user with hashed password
      bcrypt.hash("password123", 10, (err, hash) => {
        if (err) return done(err);
        db.run(
          `INSERT INTO users (username, password) VALUES (?, ?)`,
          ["admin", hash],
          (err) => {
            if (err) return done(err);
            // Initialize server with injected db
            app = createServer(db);
            // Create authenticated session
            agent = request.agent(app);
            agent
              .post("/login")
              .send({ username: "admin", password: "password123" })
              .end(done);
          }
        );
      });
    });
  });

  it("should return the login page", (done) => {
    request(app)
      .get("/login")
      .expect(200)
      .expect((res) => {
        assert(res.text.includes("form")); // crude check for form existence
      })
      .end(done);
  });

  it("should login with correct credentials", (done) => {
    const agent = request.agent(app);
    agent
      .post("/login")
      .send({ username: "admin", password: "password123" })
      .expect("Location", "/dashboard")
      .expect(302, done);
  });

  it("should fail to login with incorrect credentials", (done) => {
    request(app)
      .post("/login")
      .send({ username: "admin", password: "wrongpassword" })
      .expect("Location", "/login")
      .expect(302, done);
  });

  describe("Trip Management", () => {
    it("should create a new trip", (done) => {
      const tripData = {
        name: "Test Trip",
        start_date: "2024-01-01",
        end_date: "2024-01-07",
        cost_of_rental: 1000,
        cost_per_seat: 100,
        total_seats: 10
      };

      agent
        .post("/add-trip")
        .send(tripData)
        .expect(302)
        .expect("Location", "/trips")
        .end((err) => {
          if (err) return done(err);
          // Verify trip was created
          db.get("SELECT * FROM trips WHERE name = ?", [tripData.name], (err, trip) => {
            if (err) return done(err);
            expect(trip).toBeTruthy();
            expect(trip.total_seats).toBe(10);
            done();
          });
        });
    });

    it("should activate a trip", (done) => {
      db.get("SELECT id FROM trips LIMIT 1", [], (err, trip) => {
        if (err) return done(err);
        agent
          .post(`/trip/${trip.id}/activate`)
          .expect(302)
          .expect("Location", "/trips")
          .end((err) => {
            if (err) return done(err);
            // Verify trip was activated
            db.get("SELECT is_active FROM trips WHERE id = ?", [trip.id], (err, result) => {
              if (err) return done(err);
              expect(result.is_active).toBe(1);
              done();
            });
          });
      });
    });

    it("should handle invalid trip data", (done) => {
      const invalidTrip = {
        name: "",
        start_date: "invalid-date",
        cost_of_rental: "not-a-number"
      };

      db.serialize(() => {
        db.get("SELECT COUNT(*) as count FROM trips", [], (err, beforeCount) => {
          if (err) return done(err);
          
          agent
            .post("/add-trip")
            .send(invalidTrip)
            .expect(302)
            .end((err) => {
              if (err) return done(err);
              
              db.get("SELECT COUNT(*) as count FROM trips", [], (err, afterCount) => {
                if (err) return done(err);
                expect(afterCount.count).toBe(beforeCount.count); // No new trip should be added
                done();
              });
            });
        });
      });
    });
  });

  describe("Rider Management", () => {
    let activeTrip;

    beforeEach((done) => {
      // Ensure we have an active trip
      db.get("SELECT id FROM trips WHERE is_active = 1", [], (err, trip) => {
        if (err) return done(err);
        activeTrip = trip;
        done();
      });
    });

    it("should create a new rider", (done) => {
      const riderData = {
        name: "Test Rider",
        email: "test@example.com",
        phone: "123-456-7890",
        seats: 2
      };

      db.serialize(() => {
        agent
          .post("/add-rider")
          .send(riderData)
          .expect(302)
          .expect("Location", "/dashboard")
          .end((err) => {
            if (err) return done(err);
            // Verify rider was created
            db.get("SELECT * FROM riders WHERE email = ?", [riderData.email], (err, rider) => {
              if (err) return done(err);
              expect(rider).toBeTruthy();
              expect(rider.name).toBe(riderData.name);
              // Verify trip_riders entry
              db.get(
                "SELECT * FROM trip_riders WHERE rider_id = ?", 
                [rider.id],
                (err, tripRider) => {
                  if (err) return done(err);
                  expect(tripRider).toBeTruthy();
                  expect(tripRider.seats).toBe(2);
                  done();
                }
              );
            });
          });
      });
    });
  });

  describe("Payment Management", () => {
    let testRider;
    let activeTrip;

    beforeEach((done) => {
      db.serialize(() => {
        // First ensure we have an active trip
        db.run("UPDATE trips SET is_active = 1 WHERE id = (SELECT id FROM trips LIMIT 1)", (err) => {
          if (err) return done(err);
          
          db.get("SELECT id FROM trips WHERE is_active = 1", [], (err, trip) => {
            if (err) return done(err);
            activeTrip = trip;
            
            // Then create our test rider
            const riderData = {
              name: "Payment Test Rider",
              email: `payment${Date.now()}@test.com`,
              phone: "555-0123",
              seats: 2
            };

            db.run(
              "INSERT INTO riders (name, email, phone) VALUES (?, ?, ?)",
              [riderData.name, riderData.email, riderData.phone],
              function(err) {
                if (err) return done(err);
                testRider = { id: this.lastID, ...riderData };
                done();
              }
            );
          });
        });
      });
    });

    it("should add a payment for rider", (done) => {
      const payment = {
        date: "2024-01-15",
        amount: 100
      };

      db.serialize(() => {
        agent
          .post(`/add-payment/${testRider.id}`)
          .send(payment)
          .expect(302)
          .end((err) => {
            if (err) return done(err);
            db.get(
              "SELECT * FROM payments WHERE rider_id = ?",
              [testRider.id],
              (err, result) => {
                if (err) return done(err);
                expect(result).toBeTruthy();
                expect(result.amount).toBe(100);
                done();
              }
            );
          });
      });
    });

    it("should edit an existing payment", (done) => {
      db.serialize(() => {  // Use serialize to ensure operations complete in order
        db.run(
          "INSERT INTO payments (rider_id, trip_id, date, amount) VALUES (?, ?, ?, ?)",
          [testRider.id, activeTrip.id, "2024-01-15", 100],
          function(err) {
            if (err) return done(err);
            const paymentId = this.lastID;

            agent
              .post(`/edit-payment/${paymentId}`)
              .send({
                date: "2024-01-16",
                amount: 150
              })
              .expect(302)
              .end(done);
          }
        );
      });
    });
  });

  describe("Trip Riders Management", () => {
    let testTrip;

    beforeEach((done) => {
      db.serialize(() => {
        const tripData = {
          name: `Trip Test ${Date.now()}`,
          start_date: "2024-02-01",
          end_date: "2024-02-07",
          cost_of_rental: 1000,
          cost_per_seat: 100,
          total_seats: 10
        };

        db.run(
          "INSERT INTO trips (name, start_date, end_date, cost_of_rental, cost_per_seat, total_seats) VALUES (?, ?, ?, ?, ?, ?)",
          [tripData.name, tripData.start_date, tripData.end_date, tripData.cost_of_rental, tripData.cost_per_seat, tripData.total_seats],
          function(err) {
            if (err) return done(err);
            testTrip = { id: this.lastID, ...tripData };
            done();
          }
        );
      });
    });

    it("should add multiple riders to a trip", (done) => {
      const riders = [
        { name: "Rider 1", email: "rider1@test.com", seats: 2 },
        { name: "Rider 2", email: "rider2@test.com", seats: 1 }
      ];

      db.serialize(() => {
        let insertCount = 0;
        riders.forEach(rider => {
          db.run(
            "INSERT INTO riders (name, email) VALUES (?, ?)",
            [rider.name, rider.email],
            function(err) {
              if (err) return done(err);
              const riderId = this.lastID;
              
              db.run(
                "INSERT INTO trip_riders (trip_id, rider_id, seats) VALUES (?, ?, ?)",
                [testTrip.id, riderId, rider.seats],
                (err) => {
                  if (err) return done(err);
                  insertCount++;
                  if (insertCount === riders.length) {
                    db.all(
                      "SELECT * FROM trip_riders WHERE trip_id = ?",
                      [testTrip.id],
                      (err, tripRiders) => {
                        if (err) return done(err);
                        expect(tripRiders.length).toBe(2);
                        done();
                      }
                    );
                  }
                }
              );
            }
          );
        });
      });
    });
  });

  describe("Additional Endpoints", () => {
    it("GET /change-password should return the change-password form", (done) => {
      agent.get("/change-password").expect(200, done);
    });

    it("POST /change-password should redirect to /dashboard", (done) => {
      agent
        .post("/change-password")
        .send({ newPassword: "newpassword123" })
        .expect("Location", "/dashboard")
        .expect(302, done);
    });

    it("GET /logout should redirect to /login", (done) => {
      agent.get("/logout").expect("Location", "/login").expect(302, done);
    });

    it("GET /add-user should return the add-user form", (done) => {
      // Re–login since /logout cleared the session
      agent
        .post("/login")
        .send({ username: "admin", password: "newpassword123" })
        .end(() => {
          agent.get("/add-user").expect(200, done);
        });
    });

    it("POST /add-user should create a new user and redirect", (done) => {
      agent
        .post("/add-user")
        .send({ username: "testuser", password: "testpass" })
        .expect("Location", "/dashboard")
        .expect(302, done);
    });

    it("GET /dashboard should return dashboard for authenticated user", (done) => {
      agent.get("/dashboard").expect(200, done);
    });
  });

  describe("Coverage Improvement Endpoints", () => {
    let riderId, paymentId, tripId;

    // Create a rider for edit tests
    beforeAll((done) => {
      agent
        .post("/add-rider")
        .send({ name: "Edit Rider", email: "edit@test.com", phone: "111-2222", seats: 1 })
        .end((err) => {
          if (err) return done(err);
          db.get("SELECT id FROM riders WHERE email = ?", ["edit@test.com"], (err, row) => {
            if (err) return done(err);
            riderId = row.id;
            done();
          });
        });
    });

    it("GET /edit-rider/:id should return the edit form", (done) => {
      agent.get(`/edit-rider/${riderId}`).expect(200, done);
    });
    
    it("POST /edit-rider/:id should update rider and redirect", (done) => {
      agent
        .post(`/edit-rider/${riderId}`)
        .send({
          name: "Edited Rider", email: "edit@test.com", phone: "111-3333", seats: 2,
          balance: 200, street: "", city: "", state: "", zip: "", instructions_sent: false
        })
        .expect("Location", "/dashboard")
        .expect(302, done);
    });

    it("GET /rider/:id/payments should show payment history", (done) => {
      agent.get(`/rider/${riderId}/payments`).expect(200, done);
    });

    // Create a payment for further tests.
    it("should add and then edit a payment for rider", (done) => {
      agent
        .post(`/add-payment/${riderId}`)
        .send({ date: "2024-02-01", amount: 50 })
        .end((err) => {
          if (err) return done(err);
          db.get("SELECT id FROM payments WHERE rider_id = ?", [riderId], (err, row) => {
            if (err) return done(err);
            paymentId = row.id;
            // Test GET edit payment page
            agent.get(`/edit-payment/${paymentId}`).expect(200, () => {
              // Update the payment
              agent
                .post(`/edit-payment/${paymentId}`)
                .send({ date: "2024-02-02", amount: 75 })
                .expect("Location", `/rider/${riderId}/payments`)
                .expect(302, done);
            });
          });
        });
    });

    it("POST /delete-payment/:paymentId should delete a payment", (done) => {
      // First add a new payment so we can delete it.
      agent
        .post(`/add-payment/${riderId}`)
        .send({ date: "2024-02-03", amount: 100 })
        .end((err) => {
          if (err) return done(err);
          db.get("SELECT id FROM payments WHERE rider_id = ? ORDER BY id DESC LIMIT 1", [riderId], (err, row) => {
            if (err) return done(err);
            const delPaymentId = row.id;
            agent
              .post(`/delete-payment/${delPaymentId}`)
              .expect(302)
              .expect("Location", `/rider/${riderId}/payments`, done);
          });
        });
    });

    // Trip Riders endpoints
    it("GET /trip/:id/add-riders should return add-trip-riders form", (done) => {
      // Create a new trip for testing.
      const tripData = {
        name: "Trip For Riders",
        start_date: "2024-03-01",
        end_date: "2024-03-05",
        cost_of_rental: 500,
        cost_per_seat: 50,
        total_seats: 20
      };
      agent
        .post("/add-trip")
        .send(tripData)
        .end((err) => {
          if (err) return done(err);
          db.get("SELECT id FROM trips WHERE name = ?", [tripData.name], (err, row) => {
            if (err) return done(err);
            tripId = row.id;
            agent.get(`/trip/${tripId}/add-riders`).expect(200, done);
          });
        });
    });

    it("POST /trip/:id/add-riders should add a rider to a trip and redirect", (done) => {
      // Create another rider for this trip.
      agent
        .post("/add-rider")
        .send({ name: "Trip Rider", email: "triprider@test.com", phone: "222-4444", seats: 1 })
        .end((err) => {
          if (err) return done(err);
          db.get("SELECT id FROM riders WHERE email = ?", ["triprider@test.com"], (err, row) => {
            if (err) return done(err);
            const newRiderId = row.id;
            // Simulate form data structure for selected riders
            agent
              .post(`/trip/${tripId}/add-riders`)
              .send({ selected_riders: newRiderId, seats: { [newRiderId]: "1" } })
              .expect("Location", "/trips")
              .expect(302, done);
          });
        });
    });
  });

  describe("Additional Coverage Endpoints Part 2", () => {
    it("GET / should redirect to /dashboard", (done) => {
      agent.get("/").expect("Location", "/dashboard").expect(302, done);
    });

    it("GET /add-trip should return trip creation form", (done) => {
      agent.get("/add-trip").expect(200, done);
    });

    it("GET /trips should return a list of trips", (done) => {
      agent.get("/trips").expect(200, done);
    });

    it("GET /delete-rider/:id should delete a rider with no payments", (done) => {
      const riderData = {
        name: "Delete Rider",
        email: "delete@test.com",
        phone: "000-1111",
        seats: 1,
        street: "",
        city: "",
        state: "",
        zip: ""
      };
      // Create a rider to later delete
      agent
        .post("/add-rider")
        .send(riderData)
        .end((err) => {
          if (err) return done(err);
          db.get("SELECT id FROM riders WHERE email = ?", [riderData.email], (err, row) => {
            if (err) return done(err);
            const delId = row.id;
            agent
              .get(`/delete-rider/${delId}`)
              .expect("Location", "/dashboard")
              .expect(302, () => {
                // Verify deletion by checking that no rider exists with this id
                db.get("SELECT * FROM riders WHERE id = ?", [delId], (err, row) => {
                  if (err) return done(err);
                  expect(row).toBeUndefined();
                  done();
                });
              });
          });
        });
    });

    it("GET /add-payment/:riderId should return the payment form", (done) => {
      const uniqueEmail = `paymentform${Date.now()}_${Math.random()}@test.com`;
      const riderData = {
        name: "Payment Form Rider",
        email: uniqueEmail,
        phone: "222-3333",
        street: "",
        city: "",
        state: "",
        zip: ""
      };
      // Directly insert into riders table to avoid duplicate trip_riders insertion
      db.run(
        "INSERT INTO riders (name, email, phone, street, city, state, zip) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [riderData.name, riderData.email, riderData.phone, riderData.street, riderData.city, riderData.state, riderData.zip],
        function(err) {
          if (err) return done(err);
          agent.get(`/add-payment/${this.lastID}`).expect(200, done);
        }
      );
    });
  });

  describe("Dashboard No Active Trip Tests", () => {
    beforeEach((done) => {
      // Clear all active trips
      db.run("UPDATE trips SET is_active = 0", done);
    });

    it("should redirect to /add-trip when no trips exist", (done) => {
      // Delete all trips
      db.run("DELETE FROM trips", (err) => {
        if (err) return done(err);
        agent
          .get("/dashboard")
          .expect("Location", "/add-trip")
          .expect(302, done);
      });
    });

    it("should redirect to /trips when trips exist but none active", (done) => {
      // Create an inactive trip
      const tripData = {
        name: "Inactive Trip",
        start_date: "2024-04-01",
        end_date: "2024-04-07",
        cost_of_rental: 1000,
        cost_per_seat: 100,
        total_seats: 10,
        is_active: 0
      };

      db.run(
        "INSERT INTO trips (name, start_date, end_date, cost_of_rental, cost_per_seat, total_seats, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [tripData.name, tripData.start_date, tripData.end_date, tripData.cost_of_rental, tripData.cost_per_seat, tripData.total_seats, tripData.is_active],
        (err) => {
          if (err) return done(err);
          agent
            .get("/dashboard")
            .expect("Location", "/trips")
            .expect(302, done);
        }
      );
    });
  });
});
