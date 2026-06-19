"""
Unit tests for auth helpers — password hashing and JWT tokens.
No database or HTTP calls; these test pure functions only.
"""
import pytest
from jose import jwt

from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
    _decode_token,
    SECRET_KEY,
    ALGORITHM,
)


# ── Password hashing ──────────────────────────────────────────────────────────

class TestPasswordHashing:
    def test_hash_differs_from_plain_text(self):
        assert hash_password("mysecret") != "mysecret"

    def test_hash_is_salted(self):
        # Same password produces different hashes each call (bcrypt salts internally)
        assert hash_password("mysecret") != hash_password("mysecret")

    def test_verify_correct_password_returns_true(self):
        hashed = hash_password("correct-horse-battery")
        assert verify_password("correct-horse-battery", hashed) is True

    def test_verify_wrong_password_returns_false(self):
        hashed = hash_password("correct-horse-battery")
        assert verify_password("wrong-password", hashed) is False

    def test_verify_empty_string_returns_false(self):
        hashed = hash_password("notempty")
        assert verify_password("", hashed) is False

    def test_verify_case_sensitive(self):
        hashed = hash_password("Password")
        assert verify_password("password", hashed) is False


# ── JWT tokens ────────────────────────────────────────────────────────────────

class TestAccessToken:
    def test_access_token_contains_username(self):
        token = create_access_token("alice")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["sub"] == "alice"

    def test_access_token_type_is_access(self):
        token = create_access_token("alice")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["type"] == "access"

    def test_access_token_has_expiry(self):
        token = create_access_token("alice")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert "exp" in payload

    def test_decode_access_token_returns_username(self):
        token = create_access_token("alice")
        assert _decode_token(token, "access") == "alice"

    def test_access_token_rejected_as_refresh(self):
        token = create_access_token("alice")
        assert verify_refresh_token(token) is None


class TestRefreshToken:
    def test_refresh_token_contains_username(self):
        token = create_refresh_token("bob")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["sub"] == "bob"

    def test_refresh_token_type_is_refresh(self):
        token = create_refresh_token("bob")
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["type"] == "refresh"

    def test_verify_refresh_token_returns_username(self):
        token = create_refresh_token("bob")
        assert verify_refresh_token(token) == "bob"

    def test_refresh_token_rejected_as_access(self):
        token = create_refresh_token("bob")
        assert _decode_token(token, "access") is None


class TestTokenSecurity:
    def test_tampered_token_rejected(self):
        token = create_access_token("alice")
        # Flip the last few characters to corrupt the signature
        tampered = token[:-6] + ("A" * 6)
        assert _decode_token(tampered, "access") is None

    def test_token_signed_with_wrong_secret_rejected(self):
        fake_token = jwt.encode(
            {"sub": "hacker", "type": "access"},
            "wrong-secret-key",
            algorithm=ALGORITHM,
        )
        assert _decode_token(fake_token, "access") is None

    def test_empty_string_token_rejected(self):
        assert _decode_token("", "access") is None

    def test_garbage_token_rejected(self):
        assert _decode_token("not.a.valid.jwt.token", "access") is None
