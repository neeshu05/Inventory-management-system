# InvenTrack — Inventory & Order Management System

A full-stack, multi-tenant inventory management system built with FastAPI, React, and PostgreSQL. Each user account is fully isolated — users can only see and manage their own products, customers, and orders.

**Live demo:** [inventory-management-system-five-lake.vercel.app](https://inventory-management-system-five-lake.vercel.app)  
**Docker Hub:** [hub.docker.com/r/neeshu05/inventory-backend](https://hub.docker.com/r/neeshu05/inventory-backend)

[![Docker Pulls](https://img.shields.io/docker/pulls/neeshu05/inventory-backend)](https://hub.docker.com/r/neeshu05/inventory-backend)
[![Docker Image Size](https://img.shields.io/docker/image-size/neeshu05/inventory-backend/latest)](https://hub.docker.com/r/neeshu05/inventory-backend)

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Application Flow](#application-flow)
- [Authentication Design](#authentication-design)
- [Why localStorage Instead of Cookies](#why-localstorage-instead-of-cookies)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Running Locally](#running-locally)
- [Running with Docker](#running-with-docker)
- [Deployment](#deployment)
- [Project Structure](#project-structure)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLAlchemy 2.0, Pydantic v2, Python 3.12 |
| Database | PostgreSQL 15 |
| Auth | JWT (access + refresh tokens), bcrypt |
| Frontend | React 18, Vite, Tailwind CSS |
| HTTP Client | Axios with interceptors |
| Backend Tests | pytest, SQLite in-memory (StaticPool) |
| Frontend Tests | Vitest, React Testing Library, MSW |
| Containerization | Docker, Docker Compose |

---

## Application Flow

### High-Level Architecture

```
Browser (Vercel)
      │
      │  HTTPS + Authorization: Bearer <token>
      ▼
FastAPI Backend (Render)
      │
      │  SQLAlchemy ORM
      ▼
PostgreSQL (Render managed DB)
```

### User Journey

```
Register / Login
      │
      │  POST /auth/register or /auth/login
      │  ← { user, access_token, refresh_token }
      │
      ▼
Tokens stored in localStorage
      │
      ▼
Every API request includes:
  Authorization: Bearer <access_token>
      │
      ▼
Protected pages: Dashboard → Products → Customers → Orders
      │
      │  Access token expires (15 min)
      ▼
Axios interceptor silently calls POST /auth/refresh
  Body: { refresh_token }
  ← { access_token, refresh_token }
      │
      ▼
New tokens stored, original request retried
      │
      │  Refresh token expires (7 days) or is invalid
      ▼
User redirected to /login
```

### Multi-Tenancy

Every database query is scoped by `owner_id = current_user.id`. A user with a valid token cannot read or modify another user's data — they receive a 404 as if the resource doesn't exist.

### Cursor-Based Pagination

Products, Customers, and Orders all use cursor-based pagination (`?cursor=<last_id>&limit=10`) rather than offset pagination. This avoids the "shifting rows" problem where records inserted between page loads cause items to be skipped or duplicated.

### Backend Status Filter

The Products page supports server-side stock status filtering (`?status=in_stock|low_stock|out_of_stock`). The filter is applied as a SQL `WHERE` clause before the cursor is applied, so pagination works correctly across filtered result sets.

---

## Authentication Design

### Token Lifecycle

| Token | Lifetime | Purpose |
|---|---|---|
| Access token | 15 minutes | Sent with every API request |
| Refresh token | 7 days | Used once to get a new access + refresh pair |

Both tokens are signed JWTs with a `type` claim (`"access"` or `"refresh"`) so they cannot be used interchangeably.

### Silent Refresh

The Axios response interceptor in `frontend/src/services/instance.js` handles 401 responses automatically:

1. Intercepts any 401 (excluding `/auth/refresh` and `/auth/login` endpoints)
2. Queues concurrent requests that arrive while a refresh is in progress
3. Sends `POST /auth/refresh` with the stored refresh token in the request body
4. On success — stores new tokens, replays all queued requests with the new access token
5. On failure — clears localStorage, redirects to `/login`

This means token expiry is completely transparent to the user during normal usage.

---

## Why localStorage Instead of Cookies

The original implementation used **HTTP-only cookies** for token storage. This is theoretically the most secure approach because JavaScript cannot read HTTP-only cookies, eliminating XSS token theft.

### The Problem We Hit

When the frontend was deployed to **Vercel** (`inventory-management-system-five-lake.vercel.app`) and the backend to **Render** (`inventory-backend.onrender.com`), Chrome blocked every `Set-Cookie` response from the backend.

The browser DevTools showed this header on every response:

```
Sec-Fetch-Storage-Access: none
```

This is Chrome's **third-party cookie blocking** — cookies set by a domain different from the page's origin are treated as third-party cookies and blocked by default, regardless of `SameSite=None; Secure` settings. This is a privacy feature enforced in Chrome 115+ and will eventually be the default in all major browsers.

We tried setting `SameSite=None; Secure=True` on the cookies but Chrome still blocked them because Vercel and Render are different domains — not just different subdomains.

### Why localStorage Works Here

Switching to `Authorization: Bearer <token>` in the request header with tokens stored in **localStorage** bypasses the cookie mechanism entirely:

- No `Set-Cookie` headers — nothing for the browser to block
- The token travels in the `Authorization` header, which CORS allows explicitly
- Works identically whether the frontend and backend are on the same domain or different domains

### The XSS Trade-off

localStorage is readable by JavaScript, so an XSS attack could steal the access token. We accept this trade-off for the following reasons:

1. The access token is short-lived (15 minutes), limiting the window of exploitation
2. The application already has strict CORS origins configured — only the known frontend URL can make credentialed requests
3. Content Security Policy headers can be added at the Vercel/CDN layer to further reduce XSS risk
4. For a production system handling sensitive data, the right solution is a **BFF (Backend For Frontend)** pattern where a same-origin server manages the cookies — but that adds infrastructure complexity beyond the scope of this project

---

## API Reference

All endpoints except `/auth/register`, `/auth/login`, `/auth/refresh`, and `/auth/logout` require:

```
Authorization: Bearer <access_token>
```

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Create account, returns tokens |
| POST | `/auth/login` | Sign in, returns tokens |
| POST | `/auth/refresh` | Refresh tokens — body: `{ "refresh_token": "..." }` |
| POST | `/auth/logout` | No-op (client clears tokens) |
| GET | `/auth/me` | Current user info |
| GET | `/products/` | List products (cursor pagination, optional `?status=`) |
| POST | `/products/` | Create product |
| GET | `/products/{id}` | Get single product |
| PUT | `/products/{id}` | Update product |
| DELETE | `/products/{id}` | Delete product |
| GET | `/products/search?q=` | Search by name or SKU |
| POST | `/products/bulk` | Bulk import from CSV |
| GET | `/customers/` | List customers (cursor pagination) |
| POST | `/customers/` | Create customer |
| DELETE | `/customers/{id}` | Delete customer |
| GET | `/customers/search?q=` | Search by name, email, or phone |
| GET | `/orders/` | List orders (cursor pagination) |
| POST | `/orders/` | Create order (deducts stock) |
| PATCH | `/orders/{id}/complete` | Mark order as completed |
| DELETE | `/orders/{id}` | Cancel order (restores stock) |
| GET | `/dashboard/stats` | Aggregate stats |
| GET | `/dashboard/trends` | Weekly orders + revenue chart data |
| GET | `/dashboard/low-stock` | Paginated low/out-of-stock products |

Interactive API docs are available at `/docs` (Swagger UI) when the backend is running.

---

## Testing

The project has **156 backend tests** and **55 frontend tests**.

### Backend Tests

Tests run against an **in-memory SQLite database** using SQLAlchemy's `StaticPool`, so they are fast, isolated, and require no running PostgreSQL instance.

```bash
cd backend
python -m pytest tests/ -v
```

#### Test Coverage by Module

| File | Tests | What it covers |
|---|---|---|
| `tests/unit/test_auth.py` | 19 | JWT creation, expiry, wrong type rejection, bcrypt hashing |
| `tests/unit/test_crud.py` | 24 | CRUD operations, stock deduction, cancellation restore, dashboard stats |
| `tests/integration/test_auth_api.py` | 18 | Register, login, refresh, `/me`, error cases |
| `tests/integration/test_products_api.py` | 31 | CRUD, pagination, search, status filter, multi-tenant isolation |
| `tests/integration/test_customers_api.py` | 19 | CRUD, pagination, search, duplicate email |
| `tests/integration/test_orders_api.py` | 25 | Create, complete, cancel, stock restoration, search |
| `tests/integration/test_dashboard_api.py` | 20 | Stats, low-stock pagination, trends |

Key scenarios tested:

- **Multi-tenant isolation** — user A cannot access user B's resources (returns 404)
- **Stock deduction on order create** — product quantity decreases by the ordered amount
- **Stock restoration on cancel** — cancelling an order adds stock back
- **Status filter with pagination** — `?status=low_stock&cursor=5` returns correct page
- **Token type enforcement** — a refresh token cannot be used as an access token
- **Refresh token flow** — valid refresh token returns new access + refresh pair

### Frontend Tests

Frontend tests use **Vitest + React Testing Library + MSW** (Mock Service Worker) to intercept API calls and return controlled responses.

```bash
cd frontend
npx vitest run
```

#### Test Coverage by Page

| File | Tests | What it covers |
|---|---|---|
| `Login.test.jsx` | 6 | Renders, wrong credentials toast, success redirect, loading state |
| `Register.test.jsx` | 6 | Renders, password mismatch, success, taken username, button disabled |
| `Dashboard.test.jsx` | 10 | Stat card values, low stock table, badges, pagination, empty state |
| `Products.test.jsx` | 11 | Table rows, SKUs, badges, empty state, search, add modal, delete, status filter |
| `Customers.test.jsx` | 10 | Table rows, emails, null phone em-dash, empty state, add form, delete |
| `Orders.test.jsx` | 12 | Rows, IDs, status badges, complete action, cancel modal, PATCH call, empty state |

---

## Running Locally

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 15 running locally

### Backend

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Create .env (see backend/.env.example)
cp .env.example .env
# Edit .env — set DATABASE_URL to your local postgres connection

# Run
uvicorn app.main:app --reload --port 8000
```

Required environment variables:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/inventory_db
SECRET_KEY=<at-least-32-random-characters>
CORS_ORIGINS=http://localhost:5173
```

Generate a strong secret key:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Create .env.local
echo "VITE_API_URL=http://localhost:8000" > .env.local

# Run
npm run dev
```

---

## Running with Docker

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env — set SECRET_KEY to a strong random value

# Start all services (PostgreSQL + backend + frontend)
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

---

## Pull from Docker Hub

```bash
docker pull neeshu05/inventory-backend:latest
```

Run standalone (you provide an external PostgreSQL):

```bash
docker run -d \
  -e DATABASE_URL=postgresql://user:password@host:5432/inventory_db \
  -e SECRET_KEY=your-secret-key-min-32-chars \
  -e CORS_ORIGINS=http://localhost:5173 \
  -p 8000:8000 \
  neeshu05/inventory-backend:latest
```

---

## Deployment

The live app is deployed with:

- **Backend** → [Render](https://render.com) (free tier web service)
- **Frontend** → [Vercel](https://vercel.com) (free tier)
- **Database** → Render managed PostgreSQL

### Vercel Environment Variables

| Variable | Value |
|---|---|
| `VITE_API_URL` | Your Render backend URL, e.g. `https://your-app.onrender.com` |

> Vite bakes `VITE_*` variables at build time. After adding or changing this variable, you must trigger a new deployment for it to take effect.

### Render Environment Variables

| Variable | Value |
|---|---|
| `DATABASE_URL` | Provided automatically by Render when you attach a PostgreSQL database |
| `SECRET_KEY` | A strong random secret — generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `CORS_ORIGINS` | Your Vercel frontend URL, e.g. `https://your-app.vercel.app` |

### Vercel SPA Routing

React Router handles all routing client-side. Without the following config, refreshing any page except `/` returns a 404 from Vercel's file server. The `vercel.json` in the `frontend/` directory fixes this:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### Render Free Tier Note

The Render free tier spins down inactive services after 15 minutes of no traffic. The first request after a cold start can take 30–60 seconds. This is expected behaviour on the free plan, not a bug.

---

## Project Structure

```
inventory-management/
├── docker-compose.yml
├── .env.example
│
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app, CORS middleware, router registration
│   │   ├── auth.py          # JWT creation/validation, get_current_user dependency
│   │   ├── models.py        # SQLAlchemy ORM models
│   │   ├── schemas.py       # Pydantic request/response schemas
│   │   ├── crud.py          # Database query functions
│   │   ├── database.py      # SQLAlchemy engine and session
│   │   └── routers/
│   │       ├── auth.py      # /auth endpoints
│   │       ├── products.py  # /products endpoints
│   │       ├── customers.py # /customers endpoints
│   │       ├── orders.py    # /orders endpoints
│   │       └── dashboard.py # /dashboard endpoints
│   └── tests/
│       ├── conftest.py      # pytest fixtures (in-memory DB, auth_client)
│       ├── unit/
│       │   ├── test_auth.py # JWT and password unit tests
│       │   └── test_crud.py # CRUD layer unit tests
│       └── integration/
│           ├── test_auth_api.py
│           ├── test_products_api.py
│           ├── test_customers_api.py
│           ├── test_orders_api.py
│           └── test_dashboard_api.py
│
└── frontend/
    ├── vercel.json          # SPA rewrite rule for React Router
    └── src/
        ├── App.jsx          # Route definitions, ProtectedRoute wrapper
        ├── context/
        │   └── AuthContext.jsx    # User state, login/logout, token storage
        ├── components/
        │   ├── Layout.jsx         # Header (desktop + mobile), main wrapper
        │   ├── Sidebar.jsx        # Desktop navigation sidebar
        │   ├── BottomNav.jsx      # Mobile bottom navigation bar
        │   ├── Modal.jsx          # Reusable modal component
        │   └── BulkImportModal.jsx
        ├── pages/
        │   ├── Login.jsx
        │   ├── Register.jsx
        │   ├── Dashboard.jsx
        │   ├── Products.jsx
        │   ├── Customers.jsx
        │   └── Orders.jsx
        ├── services/
        │   ├── instance.js        # Axios instance, auth interceptors, silent refresh
        │   ├── auth.js
        │   ├── products.js
        │   ├── customers.js
        │   ├── orders.js
        │   └── dashboard.js
        └── __tests__/
            ├── testUtils.jsx      # renderWithAuth helper, shared mock data
            └── pages/
                ├── Login.test.jsx
                ├── Register.test.jsx
                ├── Dashboard.test.jsx
                ├── Products.test.jsx
                ├── Customers.test.jsx
                └── Orders.test.jsx
```
