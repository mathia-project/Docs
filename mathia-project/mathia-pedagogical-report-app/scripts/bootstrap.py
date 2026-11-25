#!/usr/bin/env python3
"""Configure and start an isolated local Mathia installation."""

import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def configure() -> None:
    destination = ROOT / ".env"
    if destination.exists():
        print("Using existing .env; credentials and data are preserved.")
        return
    values = {
        "POSTGRES_PASSWORD": secrets.token_hex(24),
        "DIRECTUS_SECRET": secrets.token_hex(32),
        "DIRECTUS_ADMIN_PASSWORD": secrets.token_hex(24),
        "SEED_DIRECTOR_PASSWORD": secrets.token_hex(24),
        "SEED_TEACHER_PASSWORD": secrets.token_hex(24),
        "SEED_STUDENTS_JSON": json.dumps([
            {"email": "student@example.com", "password": secrets.token_hex(24),
             "firstName": "Lucas", "lastName": "Garcia", "externalId": "ALU-001"},
            {"email": "student2@example.com", "password": secrets.token_hex(24),
             "firstName": "Emma", "lastName": "Rodriguez", "externalId": "ALU-002"},
        ], ensure_ascii=False, separators=(",", ":")),
    }
    lines = []
    for line in (ROOT / ".env.example").read_text(encoding="utf-8").splitlines():
        key = line.partition("=")[0]
        lines.append(f"{key}={values[key]}" if key in values else line)
    with destination.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write("\n".join(lines) + "\n")
    if os.name != "nt":
        destination.chmod(0o600)
    print("Created .env with unique local passwords. Keep this file private.")


def compose(*arguments: str) -> None:
    # Avoid accidentally importing credentials or configuration from another project.
    environment = {key: value for key, value in os.environ.items()
                   if not key.startswith(("COMPOSE_", "POSTGRES_", "DIRECTUS_", "SEED_",
                                          "AI_", "GOOGLE_", "VERTEX_", "VITE_"))
                   and key != "APP_PORT"}
    subprocess.run(
        ["docker", "compose", "--project-name", "mathia-local", "--env-file", str(ROOT / ".env"),
         "-f", str(ROOT / "docker-compose.yml"), *arguments],
        cwd=ROOT, env=environment, check=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--configure-only", action="store_true",
                        help="Create .env without starting Docker")
    args = parser.parse_args()
    configure()
    if args.configure_only:
        return 0
    if not shutil.which("docker"):
        print("Install Docker with Compose v2, then run this command again.", file=sys.stderr)
        return 1
    try:
        compose("config", "--quiet")
        compose("up", "-d", "--build", "--wait", "--wait-timeout", "600")
    except subprocess.CalledProcessError:
        print("Startup failed. Check that Docker is running, then inspect docker compose logs.",
              file=sys.stderr)
        return 1
    print("Mathia is ready. Default URLs: http://localhost:5173 (app), "
          "http://localhost:8055 (Directus), http://localhost:8000/docs (API).")
    print("Sign in using the accounts and passwords in .env. See README.md for details.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
