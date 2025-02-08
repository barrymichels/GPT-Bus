-- Create a default trip for existing data
INSERT INTO trips (
    name,
    start_date,
    end_date,
    cost_of_rental,
    cost_per_seat,
    total_seats,
    is_active
) VALUES (
    'Legacy Trip',
    date('now'),
    date('now', '+1 month'),
    5000,
    130,
    50,
    1
);

-- Copy rider data to new structure
INSERT INTO trip_riders (trip_id, rider_id, seats, balance, instructions_sent)
SELECT 
    1,
    id,
    seats,
    balance,
    instructions_sent
FROM riders;

-- Copy data to new riders table
INSERT INTO riders_new (id, name, email, phone, street, city, state, zip)
SELECT id, name, email, phone, street, city, state, zip
FROM riders;

-- Drop old riders table and rename new one
DROP TABLE riders;
ALTER TABLE riders_new RENAME TO riders;

-- Update payments table to include trip_id
ALTER TABLE payments ADD COLUMN trip_id INTEGER DEFAULT 1;
