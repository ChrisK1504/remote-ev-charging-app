ALTER TABLE charging_sessions
ADD COLUMN user_id uuid,
ADD CONSTRAINT charging_sessions_user_id_fk
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT;