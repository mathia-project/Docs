# PostgreSQL

PostgreSQL is the data source of truth. init/ defines the initial schema and references migrations. Docker runs these files in order when creating an empty volume. Editing initialization files does not update an existing database.

migrations/ preserves schema evolution. tests/ includes SQL checks and curriculum generator tests. scripts/generate_curriculum_sql.py uses the bundled catalog in data/standards/final/.

Composite foreign keys enforce school integrity. Equivalent simple keys allow Directus to discover relations. Links to Directus users and files are added later by directus/migrations/.

The Directus bootstrap configures relational authorization by school and class. The SPA never connects directly to PostgreSQL.
