-- SmartQueue database schema
-- Run this once:  docker exec -i smartqueue-db psql -U smartqueue -d smartqueue < schema.sql

DROP TABLE IF EXISTS service_records CASCADE;

DROP TABLE IF EXISTS tokens CASCADE;

DROP TABLE IF EXISTS counters CASCADE;

DROP TABLE IF EXISTS locations CASCADE;

DROP TABLE IF EXISTS services CASCADE;

DROP TABLE IF EXISTS organizations CASCADE;

DROP TABLE IF EXISTS users CASCADE;

-- SRS 10: Users -- User ID, name, email, password, role
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name TEXT,
    email TEXT,
    password TEXT,
    role TEXT
);

-- SRS 10: Organizations -- Organization ID, name, type
CREATE TABLE organizations (
    id SERIAL PRIMARY KEY,
    name TEXT,
    type TEXT
);

-- SRS 10: Services -- Service ID, service name
-- These are the 4 categories the customer picks on step 1/4
CREATE TABLE services (
    id SERIAL PRIMARY KEY,
    name TEXT,
    icon TEXT
);

-- SRS 10: Locations -- Location ID, organization ID, name
CREATE TABLE locations (
    id SERIAL PRIMARY KEY,
    organization_id INT REFERENCES organizations (id),
    service_id INT REFERENCES services (id),
    name TEXT
);

-- SRS 10: Counters -- Counter ID, location, status
-- status is 'available' or 'busy'  (FR-09 / FR-10)
CREATE TABLE counters (
    id SERIAL PRIMARY KEY,
    location_id INT REFERENCES locations (id),
    name TEXT,
    status TEXT DEFAULT 'available'
);

-- SRS 10: Tokens -- Token ID, token number, customer, service, location, status, timestamps
-- status is 'waiting', 'in_service' or 'done'
CREATE TABLE tokens (
    id SERIAL PRIMARY KEY,
    token_number INT,
    customer_name TEXT,
    service_id INT REFERENCES services (id),
    location_id INT REFERENCES locations (id),
    counter_id INT REFERENCES counters (id),
    status TEXT DEFAULT 'waiting',
    created_at TIMESTAMP DEFAULT NOW(),
    called_at TIMESTAMP,
    finished_at TIMESTAMP
);

-- SRS 10: Service Records -- Token ID, start time, end time, service duration
-- service_duration is stored in minutes, used for the average (SRS 8.2)
CREATE TABLE service_records (
    id SERIAL PRIMARY KEY,
    token_id INT REFERENCES tokens (id),
    location_id INT REFERENCES locations (id),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    service_duration NUMERIC(6, 2)
);

-- ------------------------------------------------------------------
-- Seed data
-- ------------------------------------------------------------------

INSERT INTO
    users (name, email, password, role)
VALUES (
        'Demo Staff',
        'staff@demo.com',
        '1234',
        'staff'
    ),
    (
        'Demo Admin',
        'admin@demo.com',
        '1234',
        'admin'
    );

INSERT INTO
    services (name, icon)
VALUES ('Hospital', 'H'),
    ('Bank', 'B'),
    ('Government Office', 'G'),
    ('Others', 'O');

INSERT INTO
    organizations (name, type)
VALUES (
        'City General Hospital',
        'Hospital'
    ),
    (
        'Green Life Hospital',
        'Hospital'
    ),
    ('Prime Bank', 'Bank'),
    ('Janata Bank', 'Bank'),
    (
        'Land Registry Office',
        'Government Office'
    ),
    (
        'Passport Office',
        'Government Office'
    ),
    (
        'Utility Service Center',
        'Others'
    );

INSERT INTO
    locations (
        organization_id,
        service_id,
        name
    )
VALUES (
        1,
        1,
        'City General Hospital - Main Branch'
    ),
    (
        2,
        1,
        'Green Life Hospital - Dhanmondi'
    ),
    (
        3,
        2,
        'Prime Bank - Gulshan Branch'
    ),
    (
        4,
        2,
        'Janata Bank - Motijheel Branch'
    ),
    (
        5,
        3,
        'Land Registry Office - Zone 4'
    ),
    (
        6,
        3,
        'Passport Office - Agargaon'
    ),
    (
        7,
        4,
        'Utility Service Center - Mirpur'
    );

INSERT INTO
    counters (location_id, name, status)
VALUES (1, 'Counter 01', 'available'),
    (1, 'Counter 02', 'available'),
    (2, 'Counter 01', 'available'),
    (3, 'Counter 01', 'available'),
    (4, 'Counter 01', 'available'),
    (5, 'Counter 01', 'available'),
    (6, 'Counter 01', 'available'),
    (7, 'Counter 01', 'available');

-- Finished tokens for location 1 so the average service time starts at 7.5 min
-- (this is the 7.5 figure used in the SRS example and the Figma prototype)
INSERT INTO
    tokens (
        token_number,
        customer_name,
        service_id,
        location_id,
        counter_id,
        status,
        created_at,
        called_at,
        finished_at
    )
VALUES (
        6,
        'Rahim',
        1,
        1,
        1,
        'done',
        NOW() - INTERVAL '90 minutes',
        NOW() - INTERVAL '85 minutes',
        NOW() - INTERVAL '78 minutes'
    ),
    (
        7,
        'Karim',
        1,
        1,
        1,
        'done',
        NOW() - INTERVAL '80 minutes',
        NOW() - INTERVAL '78 minutes',
        NOW() - INTERVAL '70 minutes'
    ),
    (
        8,
        'Sadia',
        1,
        1,
        1,
        'done',
        NOW() - INTERVAL '70 minutes',
        NOW() - INTERVAL '70 minutes',
        NOW() - INTERVAL '62 minutes'
    );

INSERT INTO
    service_records (
        token_id,
        location_id,
        start_time,
        end_time,
        service_duration
    )
VALUES (
        1,
        1,
        NOW() - INTERVAL '85 minutes',
        NOW() - INTERVAL '78 minutes',
        7.00
    ),
    (
        2,
        1,
        NOW() - INTERVAL '78 minutes',
        NOW() - INTERVAL '70 minutes',
        8.00
    ),
    (
        3,
        1,
        NOW() - INTERVAL '70 minutes',
        NOW() - INTERVAL '62 minutes',
        7.50
    );

-- Live queue for location 1, matching the prototype screenshots
INSERT INTO
    tokens (
        token_number,
        customer_name,
        service_id,
        location_id,
        counter_id,
        status,
        created_at,
        called_at
    )
VALUES (
        9,
        'Nusrat',
        1,
        1,
        1,
        'in_service',
        NOW() - INTERVAL '20 minutes',
        NOW() - INTERVAL '5 minutes'
    );

INSERT INTO
    tokens (
        token_number,
        customer_name,
        service_id,
        location_id,
        status,
        created_at
    )
VALUES (
        10,
        'Tanvir',
        1,
        1,
        'waiting',
        NOW() - INTERVAL '15 minutes'
    ),
    (
        11,
        'Mitu',
        1,
        1,
        'waiting',
        NOW() - INTERVAL '12 minutes'
    ),
    (
        12,
        'Arif',
        1,
        1,
        'waiting',
        NOW() - INTERVAL '9 minutes'
    );