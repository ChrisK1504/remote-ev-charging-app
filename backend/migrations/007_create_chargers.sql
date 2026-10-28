CREATE TABLE chargers (
    id uuid PRIMARY KEY,
    ocpp_id varchar NOT NULL UNIQUE,
    charge_point_model varchar(20) NOT NULL,
    charge_point_vendor_name varchar(20) NOT NULL,
    charge_point_serial_number varchar(25),
    charge_box_serial_number varchar(25),
    firmware_version varchar(50),
    iccid varchar(20),
    imsi varchar(20),
    meter_serial_number varchar(25),
    meter_type varchar(25),
    created_at timestamptz NOT NULL DEFAULT now(),
    retired_at timestamptz
);