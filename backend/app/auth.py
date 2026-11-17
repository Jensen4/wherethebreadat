import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pwdlib import PasswordHash
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app.config import get_settings
from app.db import SessionDep
from app.models import AuthSession, Credentials, SessionRead, User, UserRead
from app.rate_limit import consume_limit

router = APIRouter(prefix="/auth", tags=["auth"])
password_hash = PasswordHash.recommended()
dummy_hash = password_hash.hash("dummy-password-for-timing")


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def csrf_token(auth: AuthSession) -> str:
    return hmac.new(
        get_settings().secret_key.get_secret_value().encode(),
        f"csrf:{auth.token_hash}".encode(),
        hashlib.sha256,
    ).hexdigest()


def current_session(request: Request, session: SessionDep) -> AuthSession:
    raw = request.cookies.get(get_settings().session_cookie_name, "")
    auth = (
        session.exec(
            select(AuthSession).where(
                AuthSession.token_hash == token_hash(raw),
                AuthSession.expires_at > datetime.now(UTC),
            )
        ).first()
        if raw
        else None
    )
    if auth is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        provided = request.headers.get("x-csrf-token", "")
        if not hmac.compare_digest(provided.encode(), csrf_token(auth).encode()):
            raise HTTPException(status_code=403, detail="Invalid CSRF token")
    return auth


AuthDep = Annotated[AuthSession, Depends(current_session)]


def current_user(auth: AuthDep, session: SessionDep) -> User:
    user = session.get(User, auth.user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


UserDep = Annotated[User, Depends(current_user)]


def throttle_ip(request: Request, session: SessionDep):
    # Only use the ASGI peer. Configure forwarded-header trust at the server for
    # known reverse proxies; never parse arbitrary client-supplied headers here.
    action = request.url.path.rsplit("/", 1)[-1]
    ip = request.client.host if request.client else "unknown"
    consume_limit(
        session,
        f"{action}:ip",
        ip,
        20 if action == "login" else 5,
        900 if action == "login" else 3600,
    )


@router.post(
    "/register", response_model=UserRead, status_code=201, dependencies=[Depends(throttle_ip)]
)
def register(data: Credentials, session: SessionDep):
    email = str(data.email).lower()
    consume_limit(session, "register:account", email, 3, 3600)
    user = User(email=email, password_hash=password_hash.hash(data.password))
    session.add(user)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="Unable to register this email")
    session.refresh(user)
    return user


@router.post("/login", response_model=SessionRead, dependencies=[Depends(throttle_ip)])
def login(data: Credentials, request: Request, response: Response, session: SessionDep):
    email = str(data.email).lower()
    consume_limit(session, "login:account", email, 5, 900)
    user = session.exec(select(User).where(User.email == email)).first()
    valid = password_hash.verify(data.password, user.password_hash if user else dummy_hash)
    if user is None or not valid:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    settings = get_settings()
    raw = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    previous = request.cookies.get(settings.session_cookie_name, "")
    session.exec(delete(AuthSession).where(AuthSession.token_hash == token_hash(previous)))
    auth = AuthSession(
        token_hash=token_hash(raw),
        user_id=user.id,
        expires_at=now + timedelta(minutes=settings.session_minutes),
    )
    session.add(auth)
    session.commit()
    response.set_cookie(
        settings.session_cookie_name,
        raw,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="strict",
        path="/",
    )
    return SessionRead(id=user.id, email=user.email, csrf_token=csrf_token(auth))


@router.get("/session", response_model=SessionRead)
def session_info(auth: AuthDep, user: UserDep):
    return SessionRead(id=user.id, email=user.email, csrf_token=csrf_token(auth))


@router.post("/logout", status_code=204)
def logout(auth: AuthDep, session: SessionDep):
    session.delete(auth)
    session.commit()
    response = Response(status_code=204)
    settings = get_settings()
    response.delete_cookie(
        settings.session_cookie_name,
        path="/",
        httponly=True,
        secure=settings.secure_cookies,
        samesite="strict",
    )
    return response
