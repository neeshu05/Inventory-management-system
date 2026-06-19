"""
Integration tests for /auth endpoints.
Covers register, login, logout, token refresh, and /me.
"""
import pytest

_REG = {"username": "newuser", "email": "new@test.com", "password": "Password1"}
_LOGIN = {"username": "newuser", "password": "Password1"}


class TestRegister:
    def test_success_returns_201_and_user(self, client):
        resp = client.post("/auth/register", json=_REG)
        assert resp.status_code == 201
        assert resp.json()["user"]["username"] == "newuser"

    def test_returns_tokens_in_body(self, client):
        resp = client.post("/auth/register", json=_REG)
        body = resp.json()
        assert "access_token" in body
        assert "refresh_token" in body

    def test_duplicate_username_returns_400(self, client):
        client.post("/auth/register", json=_REG)
        resp = client.post("/auth/register", json=_REG)
        assert resp.status_code == 400

    def test_short_username_returns_422(self, client):
        resp = client.post("/auth/register", json={**_REG, "username": "ab"})
        assert resp.status_code == 422

    def test_short_password_returns_422(self, client):
        resp = client.post("/auth/register", json={**_REG, "password": "123"})
        assert resp.status_code == 422

    def test_missing_fields_returns_422(self, client):
        resp = client.post("/auth/register", json={"username": "someone"})
        assert resp.status_code == 422


class TestLogin:
    def test_success_returns_200_and_user(self, client):
        client.post("/auth/register", json=_REG)
        resp = client.post("/auth/login", json=_LOGIN)
        assert resp.status_code == 200
        assert resp.json()["user"]["username"] == "newuser"

    def test_login_returns_tokens(self, client):
        client.post("/auth/register", json=_REG)
        resp = client.post("/auth/login", json=_LOGIN)
        body = resp.json()
        assert "access_token" in body
        assert "refresh_token" in body

    def test_wrong_password_returns_401(self, client):
        client.post("/auth/register", json=_REG)
        resp = client.post("/auth/login", json={**_LOGIN, "password": "wrong"})
        assert resp.status_code == 401

    def test_unknown_user_returns_401(self, client):
        resp = client.post("/auth/login", json={"username": "ghost", "password": "whatever"})
        assert resp.status_code == 401


class TestMe:
    def test_authenticated_returns_user(self, auth_client, test_user):
        resp = auth_client.get("/auth/me")
        assert resp.status_code == 200
        assert resp.json()["username"] == test_user.username
        assert resp.json()["email"] == test_user.email

    def test_unauthenticated_returns_401(self, client):
        resp = client.get("/auth/me")
        assert resp.status_code == 401


class TestRefresh:
    def test_refresh_with_valid_token_returns_200(self, client):
        resp = client.post("/auth/register", json=_REG)
        refresh_token = resp.json()["refresh_token"]
        resp = client.post("/auth/refresh", json={"refresh_token": refresh_token})
        assert resp.status_code == 200

    def test_refresh_without_token_returns_422(self, client):
        resp = client.post("/auth/refresh", json={})
        assert resp.status_code == 422

    def test_refresh_with_invalid_token_returns_401(self, client):
        resp = client.post("/auth/refresh", json={"refresh_token": "not.a.valid.token"})
        assert resp.status_code == 401

    def test_refresh_issues_new_tokens(self, client):
        resp = client.post("/auth/register", json=_REG)
        refresh_token = resp.json()["refresh_token"]
        resp = client.post("/auth/refresh", json={"refresh_token": refresh_token})
        body = resp.json()
        assert "access_token" in body
        assert "refresh_token" in body


class TestLogout:
    def test_logout_returns_200(self, auth_client):
        resp = auth_client.post("/auth/logout")
        assert resp.status_code == 200

    def test_me_without_token_returns_401(self, client):
        resp = client.get("/auth/me")
        assert resp.status_code == 401
