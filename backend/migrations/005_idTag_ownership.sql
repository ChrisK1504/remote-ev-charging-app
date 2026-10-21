ALTER TABLE users
ADD COLUMN id_tag varchar(20) NOT NULL UNIQUE
CHECK (length(trim(id_tag)) > 0);