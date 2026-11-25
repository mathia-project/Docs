BEGIN;

-- UUID generation is the only extension required by the application schema.
-- pgcrypto is bundled with standard PostgreSQL distributions and is also
-- available in the official PostgreSQL Docker image.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

COMMIT;
