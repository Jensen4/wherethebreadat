from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings


@lru_cache
def get_engine():
    return create_engine(get_settings().database_url, pool_pre_ping=True)


def get_session():
    with Session(get_engine()) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]


if __name__ == "__main__":
    from app import models  # noqa: F401

    settings = get_settings()
    if not settings.migration_database_url:
        raise SystemExit(
            "Set MIGRATION_DATABASE_URL for table creation; the runtime role cannot create tables."
        )
    SQLModel.metadata.create_all(create_engine(settings.migration_database_url, pool_pre_ping=True))
