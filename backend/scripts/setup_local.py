"""Generate ignored local secrets without replacing existing secrets or application data."""

import secrets
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[2]


def write_values(path: Path, updates: dict[str, str]):
    lines = path.read_text().splitlines() if path.exists() else []
    found = set()
    output = []
    for line in lines:
        key = (
            line.split("=", 1)[0].strip()
            if "=" in line and not line.lstrip().startswith("#")
            else ""
        )
        if key in updates:
            output.append(f"{key}={updates[key]}")
            found.add(key)
        else:
            output.append(line)
    output.extend(f"{key}={value}" for key, value in updates.items() if key not in found)
    path.write_text("\n".join(output) + "\n")
    path.chmod(0o600)


def main():
    values = dotenv_values(ROOT / ".env")
    passwords = {}
    for key in ("POSTGRES_ADMIN_PASSWORD", "POSTGRES_APP_PASSWORD", "POSTGRES_MIGRATOR_PASSWORD"):
        value = values.get(key)
        passwords[key] = value if value and len(value) >= 32 else secrets.token_hex(32)
    write_values(ROOT / ".env", passwords)
    backend = ROOT / "backend" / ".env"
    existing = dotenv_values(backend)
    secret = existing.get("SECRET_KEY") or existing.get("JWT_SECRET")
    if not secret or len(secret) < 32 or secret.startswith("replace-with"):
        secret = secrets.token_hex(32)
    write_values(
        backend,
        {
            "DATABASE_URL": f"postgresql+psycopg://bread_app:{passwords['POSTGRES_APP_PASSWORD']}@127.0.0.1:5433/bread",
            "MIGRATION_DATABASE_URL": f"postgresql+psycopg://bread_migrator:{passwords['POSTGRES_MIGRATOR_PASSWORD']}@127.0.0.1:5433/bread",
            "SECRET_KEY": secret,
            "ENVIRONMENT": "development",
            "CORS_ORIGINS": '["http://localhost:5173","http://127.0.0.1:5173"]',
        },
    )
    print("Configured ignored local environment files. No secrets displayed.")
    print("For an existing database, run: python backend/scripts/secure_local_db.py")


if __name__ == "__main__":
    main()
