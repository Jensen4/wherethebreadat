import os
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "test-only-secret-which-is-at-least-32-characters"
os.environ["ENVIRONMENT"] = "development"

from app.auth import token_hash
from app.db import get_session
from app.main import create_app
from app.models import AuthRateLimit, AuthSession


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    app = create_app()

    def test_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = test_session
    with TestClient(
        app, headers={"X-CSRF-Protection": "1", "Origin": "http://localhost:5173"}
    ) as test_client:
        test_client.engine = engine
        yield test_client
    engine.dispose()


def register_and_login(client, email="owner@example.com"):
    client.cookies.clear()
    credentials = {"email": email, "password": "a-long-test-password"}
    response = client.post("/api/auth/register", json=credentials)
    assert response.status_code == 201
    assert "password_hash" not in response.json()
    response = client.post("/api/auth/login", json=credentials)
    assert response.status_code == 200
    raw = client.cookies.get("bread_session")
    assert raw
    assert "access_token" not in response.json()
    headers = {"Cookie": f"bread_session={raw}", "X-CSRF-Token": response.json()["csrf_token"]}
    client.cookies.clear()
    return headers


@pytest.mark.parametrize(
    "resource,payload,update",
    [
        (
            "paystubs",
            {
                "employer": "Example",
                "pay_date": "2026-11-15",
                "gross_cents": 250000,
                "deductions_cents": 50000,
                "net_cents": 200000,
            },
            {"employer": "Updated"},
        ),
        (
            "payments",
            {"recipient": "Landlord", "amount_cents": 120000, "due_date": "2026-12-01"},
            {"status": "paid", "paid_date": "2026-11-30"},
        ),
    ],
)
def test_crud_and_ownership(client, resource, payload, update):
    owner = register_and_login(client)
    other = register_and_login(client, "other@example.com")
    path = f"/api/{resource}"
    assert client.get(path).status_code == 401
    response = client.post(path, headers=owner, json={**payload, "user_id": "spoofed"})
    assert response.status_code == 201
    record_path = f"{path}/{response.json()['id']}"
    assert len(client.get(path, headers=owner).json()) == 1
    assert client.get(path, headers=other).json() == []
    assert client.get(record_path, headers=other).status_code == 404
    assert client.put(record_path, headers=other, json=payload).status_code == 404
    assert client.delete(record_path, headers=other).status_code == 404
    response = client.put(record_path, headers=owner, json={**payload, **update})
    assert response.status_code == 200
    for key, value in update.items():
        assert response.json()[key] == value
    assert client.delete(record_path, headers=owner).status_code == 204
    assert client.get(record_path, headers=owner).status_code == 404


def test_csrf_and_origin_checks(client):
    owner = register_and_login(client)
    payment = {"recipient": "Shop", "amount_cents": 100, "due_date": "2026-11-15"}
    for token in ["", "wrong"]:
        assert (
            client.post(
                "/api/payments", headers={**owner, "X-CSRF-Token": token}, json=payment
            ).status_code
            == 403
        )
    assert (
        client.post(
            "/api/payments", headers={**owner, "Origin": "https://evil.example"}, json=payment
        ).status_code
        == 403
    )
    assert client.post("/api/auth/login", headers={"Origin": "null"}, json={}).status_code == 403
    client.headers.pop("X-CSRF-Protection")
    assert client.post("/api/payments", headers=owner, json=payment).status_code == 403
    assert client.post("/api/auth/login", json={}).status_code == 403


def test_cookie_flags_and_logout_revokes_replayed_cookie(client):
    owner = register_and_login(client)
    info = client.get("/api/auth/session", headers=owner)
    assert info.status_code == 200
    assert info.headers["cache-control"] == "no-store"
    assert info.json()["csrf_token"] == owner["X-CSRF-Token"]
    raw = owner["Cookie"].split("=", 1)[1]
    with Session(client.engine) as db:
        stored = db.exec(select(AuthSession)).one()
        assert stored.token_hash == token_hash(raw)
        assert stored.token_hash != raw
    response = client.post("/api/auth/logout", headers=owner)
    assert response.status_code == 204
    assert "Max-Age=0" in response.headers["set-cookie"]
    assert client.get("/api/payments", headers=owner).status_code == 401
    assert client.get("/api/auth/session", headers=owner).status_code == 401


def test_rotation_expiry_and_legacy_tokens(client):
    old = register_and_login(client)
    response = client.post(
        "/api/auth/login",
        headers=old,
        json={"email": "owner@example.com", "password": "a-long-test-password"},
    )
    assert response.status_code == 200
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=strict" in cookie and "Path=/" in cookie
    assert client.get("/api/auth/session", headers=old).status_code == 401
    with Session(client.engine) as db:
        auth = db.exec(select(AuthSession)).one()
        auth.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.add(auth)
        db.commit()
    assert client.get("/api/auth/session").status_code == 401
    client.cookies.clear()
    assert (
        client.get("/api/payments", headers={"Authorization": "Bearer old-jwt"}).status_code == 401
    )


def test_login_account_limit_persists_and_normalizes_email(client):
    credentials = {"email": "owner@example.com", "password": "a-long-test-password"}
    assert client.post("/api/auth/register", json=credentials).status_code == 201
    for index in range(5):
        response = client.post(
            "/api/auth/login",
            json={
                **credentials,
                "email": "OWNER@example.com" if index % 2 else credentials["email"],
                "password": "incorrect-password",
            },
            headers={"X-Forwarded-For": f"192.0.2.{index}"},
        )
        assert response.status_code == 401
    response = client.post("/api/auth/login", json=credentials)
    assert response.status_code == 429
    assert int(response.headers["retry-after"]) > 0
    with Session(client.engine) as db:
        counters = db.exec(select(AuthRateLimit)).all()
        assert all("owner@example.com" not in counter.key for counter in counters)
        for counter in counters:
            counter.expires_at = datetime.now(UTC) - timedelta(seconds=1)
            db.add(counter)
        db.commit()
    assert client.post("/api/auth/login", json=credentials).status_code == 200


def test_ip_limits_cannot_be_bypassed_with_forwarded_headers(client, monkeypatch):
    # Use cheap password verification here to test buckets rather than password hashing.
    from app import auth

    monkeypatch.setattr(auth.password_hash, "verify", lambda *args: False)
    for index in range(20):
        response = client.post(
            "/api/auth/login",
            json={"email": f"user{index}@example.com", "password": "incorrect-password"},
            headers={"X-Forwarded-For": f"192.0.2.{index}"},
        )
        assert response.status_code == 401
    assert (
        client.post(
            "/api/auth/login", json={"email": "new@example.com", "password": "incorrect-password"}
        ).status_code
        == 429
    )


def test_registration_ip_limit(client):
    for index in range(5):
        assert (
            client.post(
                "/api/auth/register",
                json={"email": f"user{index}@example.com", "password": "a-long-test-password"},
            ).status_code
            == 201
        )
    assert (
        client.post(
            "/api/auth/register",
            json={"email": "sixth@example.com", "password": "a-long-test-password"},
        ).status_code
        == 429
    )


def test_validation(client):
    headers = register_and_login(client)
    paystub = {
        "employer": "Example",
        "pay_date": "2026-11-15",
        "gross_cents": 100,
        "deductions_cents": 50,
        "net_cents": 99,
    }
    assert client.post("/api/paystubs", headers=headers, json=paystub).status_code == 422
    payment = {"recipient": "Shop", "amount_cents": 100, "due_date": "2026-11-15"}
    for invalid in [
        {"amount_cents": -1},
        {"status": "paid"},
        {"paid_date": "2026-11-15"},
        {"currency": "invalid"},
    ]:
        assert (
            client.post("/api/payments", headers=headers, json={**payment, **invalid}).status_code
            == 422
        )
    assert client.get("/api/payments?limit=101", headers=headers).status_code == 422
    assert client.get("/health").json() == {"status": "ok"}


def test_production_configuration_and_secure_cookie(client):
    from pydantic import ValidationError

    from app.config import Settings, get_settings

    secure = Settings(
        _env_file=None,
        environment="production",
        database_url="postgresql+psycopg://bread_app:" + "x" * 40 + "@db/bread",
        SECRET_KEY="x" * 40,
        cors_origins=["https://bread.example"],
    )
    assert secure.secure_cookies
    assert secure.session_cookie_name == "__Host-bread_session"
    for database in [
        "sqlite://",
        "postgresql://bread:bread@db/bread",
        "postgresql://postgres:" + "x" * 40 + "@db/bread",
    ]:
        with pytest.raises(ValidationError):
            Settings(
                _env_file=None,
                environment="production",
                database_url=database,
                SECRET_KEY="x" * 40,
                cors_origins=["https://bread.example"],
            )
    from app import auth

    original = get_settings()
    # Keep the running test app's HTTP origin guard while exercising secure Set-Cookie.
    from unittest.mock import patch

    with patch.object(auth, "get_settings", return_value=secure):
        credentials = {"email": "secure@example.com", "password": "a-long-test-password"}
        assert client.post("/api/auth/register", json=credentials).status_code == 201
        response = client.post("/api/auth/login", json=credentials)
        assert response.status_code == 200
        assert "Secure" in response.headers["set-cookie"]
        assert "__Host-bread_session=" in response.headers["set-cookie"]
    assert get_settings() is original
