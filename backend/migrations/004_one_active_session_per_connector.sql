CREATE UNIQUE INDEX IDX_active_session_per_connector
ON charging_sessions (charge_point_id, connector_id)
WHERE status = 'Active';