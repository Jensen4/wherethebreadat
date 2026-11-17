"""Opt-in checks against local PostgreSQL; application records are rolled back."""

import hashlib
import hmac
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import pytest
from dotenv import dotenv_values
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import delete, text
from sqlalchemy.exc import ProgrammingError
from sqlmodel import Session, create_engine

from app.config import get_settings
from app.db import get_session
from app.main import create_app
from app.models import AuthRateLimit
from app.rate_limit import consume_limit

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_POSTGRES_TESTS") != "1", reason="Opt-in local PostgreSQL checks"
)


def local_engine():
    values = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
    return create_engine(values["DATABASE_URL"], pool_pre_ping=True)


def test_postgres_roles_and_session_flow():
    engine = local_engine()
    with engine.connect() as connection:
        transaction = connection.begin()
        app = create_app()

        def isolated_session():
            with Session(connection, join_transaction_mode="create_savepoint") as session:
                yield session

        app.dependency_overrides[get_session] = isolated_session
        try:
            role = connection.execute(
                text(
                    "SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls "
                    "FROM pg_roles WHERE rolname = current_user"
                )
            ).one()
            assert not any(role)
            assert connection.execute(text("SELECT current_user")).scalar_one() == "bread_app"
            assert not connection.execute(
                text("SELECT has_schema_privilege(current_user, 'public', 'CREATE')")
            ).scalar_one()
            assert not connection.execute(
                text("SELECT rolcanlogin FROM pg_roles WHERE rolname = 'bread'")
            ).scalar()
            with pytest.raises(ProgrammingError), connection.begin_nested():
                connection.execute(
                    text("CREATE TABLE public.security_should_be_forbidden (id int)")
                )
            with TestClient(
                app,
                headers={"X-CSRF-Protection": "1", "Origin": "http://localhost:5173"},
                client=(f"security-qa-{uuid4().hex}", 50000),
            ) as client:
                data = {
                    "email": f"qa-{uuid4().hex}@example.com",
                    "password": "a-long-test-password",
                }
                assert client.post("/api/auth/register", json=data).status_code == 201
                login = client.post("/api/auth/login", json=data)
                assert login.status_code == 200
                cookie = client.cookies.get("bread_session")
                csrf = {"X-CSRF-Token": login.json()["csrf_token"]}
                payload = {
                    "recipient": "Disposable QA",
                    "amount_cents": 100,
                    "due_date": "2026-11-15",
                }
                assert client.post("/api/payments", json=payload).status_code == 403
                assert client.post("/api/payments", json=payload, headers=csrf).status_code == 201
                assert client.get("/api/payments").status_code == 200
                assert client.post("/api/auth/logout", headers=csrf).status_code == 204
                assert (
                    client.get(
                        "/api/payments", headers={"Cookie": f"bread_session={cookie}"}
                    ).status_code
                    == 401
                )
        finally:
            transaction.rollback()
    engine.dispose()


def test_postgres_rate_limit_is_atomic_across_connections():
    engine = local_engine()
    identity = f"security-qa-{uuid4().hex}"
    digest = hmac.new(
        get_settings().secret_key.get_secret_value().encode(), identity.encode(), hashlib.sha256
    ).hexdigest()
    key = f"qa:concurrency:{digest}"

    def attempt(_):
        with Session(engine) as session:
            try:
                consume_limit(session, "qa:concurrency", identity, 5, 60)
                return 200
            except HTTPException as error:
                return error.status_code

    try:
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(attempt, range(12)))
        assert results.count(200) == 5
        assert results.count(429) == 7
    finally:
        with Session(engine) as session:
            session.exec(delete(AuthRateLimit).where(AuthRateLimit.key == key))
            session.commit()
        engine.dispose()
