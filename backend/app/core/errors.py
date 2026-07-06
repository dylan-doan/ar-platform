"""Consistent API error format (spec §4.5).

Every error response has the shape:

    {"error": {"code": "<machine-code>", "message": "<human message>", "details": ...}}

Stack traces are never leaked to clients; unexpected exceptions are logged
server-side and returned as a generic 500.
"""

from typing import Any

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = structlog.get_logger()


class ApiError(Exception):
    """Domain error with a machine-readable code."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Any = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        super().__init__(message)


def _payload(code: str, message: str, details: Any = None) -> dict:
    body: dict = {"error": {"code": code, "message": message}}
    if details is not None:
        body["error"]["details"] = details
    return body


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_payload(exc.code, exc.message, exc.details),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_payload("http_error", str(exc.detail)),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=_payload("validation_error", "Invalid request.", exc.errors()),
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
        # Log full detail server-side; never leak internals to the client.
        logger.exception("unhandled_error", path=str(request.url.path))
        return JSONResponse(
            status_code=500,
            content=_payload("internal_error", "An internal error occurred."),
        )
