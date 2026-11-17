"""Run periodically to remove expired security records, outside the login hot path."""

from datetime import UTC, datetime

from sqlalchemy import delete
from sqlmodel import Session

from app.db import get_engine
from app.models import AuthRateLimit, AuthSession


def cleanup():
    now = datetime.now(UTC)
    with Session(get_engine()) as session:
        session.exec(delete(AuthSession).where(AuthSession.expires_at <= now))
        session.exec(delete(AuthRateLimit).where(AuthRateLimit.expires_at <= now))
        session.commit()


if __name__ == "__main__":
    cleanup()
    print("Expired session and throttle records removed.")
