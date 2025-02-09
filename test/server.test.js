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

  afterAll((done) => {
    db.close(done);
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
