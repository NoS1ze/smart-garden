from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, Request


async def get_current_user(request: Request) -> Optional[dict]:
    """Extract and validate user from Authorization header.
    Returns None for unauthenticated requests (e.g. firmware POSTs).
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None

    token = auth_header[7:]
    try:
        from database import supabase
        user_response = supabase.auth.get_user(token)
        if user_response and user_response.user:
            return {
                "id": str(user_response.user.id),
                "email": user_response.user.email,
            }
    except Exception:
        pass

    raise HTTPException(status_code=401, detail="Invalid or expired token")


async def require_user(user: Optional[dict] = Depends(get_current_user)) -> dict:
    """Dependency that requires authentication."""
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


async def optional_user(user: Optional[dict] = Depends(get_current_user)) -> Optional[dict]:
    """Dependency that allows anonymous access."""
    return user
