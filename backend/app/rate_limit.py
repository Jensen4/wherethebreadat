import hashlib
import hmac
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import case
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlmodel import Session

from app.config import get_settings
from app.models import AuthRateLimit


def consume_limit(session: Session, bucket: str, identity: str, limit: int, seconds: int):
    """Atomic, database-backed counters shared across workers and application restarts."""
    now = datetime.now(UTC)
    digest = hmac.new(
        get_settings().secret_key.get_secret_value().encode(), identity.encode(), hashlib.sha256
    ).hexdigest()
    key = f"{bucket}:{digest}"
    table = AuthRateLimit.__table__
    insert = sqlite_insert if session.get_bind().dialect.name == "sqlite" else pg_insert
    expired = table.c.expires_at <= now
    statement = insert(table).values(
        key=key, attempts=1, expires_at=now + timedelta(seconds=seconds)
    )
    statement = statement.on_conflict_do_update(
        index_elements=[table.c.key],
        set_={
            "attempts": case((expired, 1), else_=table.c.attempts + 1),
            "expires_at": case(
                (expired, now + timedelta(seconds=seconds)), else_=table.c.expires_at
            ),
        },
    ).returning(table.c.attempts)
    count = session.execute(statement).scalar_one()
    session.commit()
    if count > limit:
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Please try again later.",
            headers={"Retry-After": str(seconds)},
        )
