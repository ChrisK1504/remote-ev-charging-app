CREATE TABLE users (
    id uuid PRIMARY KEY,
    email text UNIQUE NOT NULL
        CHECK (
            email = lower(trim(email))
            AND email <> ''
        ),
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);