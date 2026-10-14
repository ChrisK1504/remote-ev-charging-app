CREATE TABLE charging_sessions (
    id uuid PRIMARY KEY,
    transaction_id integer GENERATED ALWAYS AS IDENTITY UNIQUE,
    charge_point_id text NOT NULL,

    connector_id integer NOT NULL CHECK (connector_id > 0),
    id_tag varchar(20) NOT NULL,
    status text NOT NULL CHECK (status IN ('Active', 'Completed')),
    started_at timestamptz NOT NULL,
    ended_at timestamptz,
    meter_start integer NOT NULL,
    meter_stop integer,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT session_lifecycle_check CHECK 
    (
        (
            status = 'Active'
            AND ended_at IS NULL
            AND meter_stop IS NULL
        )
        OR 
        (
            status = 'Completed'
            AND ended_at IS NOT NULL
            AND meter_stop IS NOT NULL
        )
    )
);