# Trusted model storage

Only internally produced and reviewed model artifacts belong in this directory.

Python pickle files can execute code while loading. The service must never accept a model
upload or deserialize a path supplied by an API caller. A future model loader must use an
explicit, deployment-controlled allowlist and validate the expected model interface before
serving traffic.

The current service does not load pickle files. It uses a versioned deterministic baseline so
the API contract can be integrated and tested safely before an approved ML model is available.

