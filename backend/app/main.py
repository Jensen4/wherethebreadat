from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth import router as auth_router
from app.config import get_settings
from app.routes import router


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Where The Bread At API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type", "X-CSRF-Token", "X-CSRF-Protection"],
    )

    @app.middleware("http")
    async def protect_requests(request: Request, call_next):
        if request.url.path.startswith("/api/") and request.method not in {
            "GET",
            "HEAD",
            "OPTIONS",
        }:
            origin = request.headers.get("origin")
            if (origin is not None and origin not in settings.cors_origins) or request.headers.get(
                "x-csrf-protection"
            ) != "1":
                return JSONResponse(
                    {"detail": "Request origin or CSRF protection header rejected"},
                    status_code=403,
                    headers={"Cache-Control": "no-store"},
                )
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    app.include_router(auth_router, prefix="/api")
    app.include_router(router, prefix="/api")

    @app.get("/health", tags=["health"])
    def health():
        return {"status": "ok"}

    return app


app = create_app()
