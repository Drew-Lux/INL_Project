# Architect Wealth Suite

A full-stack AI-powered personal finance management platform. Track accounts, monitor cashflow, analyse investments, project future wealth, and get personalised financial guidance from **Atlas** — an AI advisor powered by Claude.

---

## Features

| Module | Description |
|---|---|
| **Dashboard** | Net worth, financial health score, monthly income, recent activity |
| **Cashflow** | Transaction ledger, budget tracking, auto-categorisation |
| **Portfolio** | Account vaults, holdings, top movers, performance history |
| **Forecaster** | Compound interest projections, milestone tracking, growth charts |
| **Atlas AI** | Claude-powered conversational financial advisor with live financial context |
| **Auth** | JWT sessions, bcrypt passwords, TOTP two-factor authentication |

---

## Tech Stack

**Backend:** Node.js, Express 5, MongoDB, Mongoose  
**Frontend:** EJS templates, vanilla JS, CSS  
**AI:** Anthropic Claude API (Atlas advisor)  
**Security:** Helmet, JWT, bcryptjs, express-rate-limit, CORS  
**Open Banking:** Yodlee API integration (infrastructure ready)

---

## Prerequisites

- Node.js v16+
- MongoDB (local or Atlas)
- [Anthropic API key](https://console.anthropic.com/)

---

## Getting Started

```bash
# 1. Clone the repository
git clone <repo-url>
cd INL_Project

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your credentials (see Environment Variables below)

# 4. Start the development server
npm run devStart
```

App runs at `http://localhost:3000`

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Database
MONGO_URI=mongodb://127.0.0.1:27017/architect

# Server
PORT=3000

# Authentication (use strong random strings in production)
JWT_SECRET=your_jwt_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here

# AI Advisor
ANTHROPIC_API_KEY=your_anthropic_key_here

# Open Banking (optional — not yet active)
YODLEE_CLIENT_ID=
YODLEE_SECRET=
YODLEE_LOGIN_NAME=
YODLEE_TEST_USER=
YODLEE_BASE_URL=https://sandbox.api.yodlee.com/ysl
```

---

## API Reference

### Authentication

| Method | Route | Description |
|---|---|---|
| `GET` | `/login` | Login page |
| `GET` | `/register` | Registration page |
| `POST` | `/auth/register` | Create account |
| `POST` | `/auth/login` | Sign in |
| `POST` | `/auth/verify-otp` | Verify 2FA OTP |
| `POST` | `/auth/refresh` | Refresh access token |
| `GET` | `/auth/logout` | Sign out |
| `PATCH` | `/auth/toggle-2fa` | Enable / disable 2FA |

### Pages (protected)

| Route | Description |
|---|---|
| `GET /` | Dashboard |
| `GET /cashflow` | Transactions & budgets |
| `GET /portfolio` | Accounts & holdings |
| `GET /forecaster` | Wealth projections |
| `GET /atlas` | AI advisor chat |

### API Endpoints (protected, JSON)

**Transactions**
- `GET / POST /api/transactions`
- `PATCH /api/transactions/:id/category`

**Budgets**
- `GET / POST / PATCH / DELETE /api/budgets/`

**Accounts**
- `GET / POST / PATCH / DELETE /api/accounts/`
- `PATCH /api/accounts/:id/balance`

**Holdings**
- `GET / POST /api/holdings/`

**Portfolio**
- `POST /api/portfolio/snapshot`
- `GET /api/portfolio/history`

**Atlas AI**
- `POST /api/atlas/chat`
- `GET /api/atlas/insights`
- `DELETE /api/atlas/session`

**User**
- `GET / PATCH /api/user/profile`
- `PATCH /api/user/password`
- `DELETE /api/user/account`
- `GET /api/user/health-score`
- `PATCH /api/user/yodlee-link`

---

## Project Structure

```
INL_Project/
├── server.js                   # App entry point, middleware, DB connection
├── controllers/                # Business logic
│   ├── AtlasController.js      # AI advisor (Claude integration)
│   ├── AuthController.js       # Registration, login, 2FA
│   ├── DashboardController.js  # Financial health score & summary
│   ├── CashflowController.js   # Transactions & budgets
│   ├── PortfolioController.js  # Accounts & holdings
│   ├── ForecasterController.js # Wealth projections
│   └── UserController.js       # Profile management
├── models/                     # MongoDB schemas
│   ├── User.js
│   ├── Account.js
│   ├── Transaction.js
│   ├── Holding.js
│   ├── BudgetCategory.js
│   ├── Portfolio.js
│   └── Atlas.js
├── routes/                     # Express route definitions
├── middleware/
│   └── Auth.js                 # JWT authentication (cookies + Bearer)
├── views/                      # EJS templates
│   └── partials/navbar.ejs
└── public/
    └── style.css
```

---

## Security

- Passwords hashed with **bcryptjs** (12 salt rounds)
- **JWT** access tokens (15 min) + refresh tokens (7 days) stored in httpOnly cookies
- **TOTP two-factor authentication** via speakeasy
- **Rate limiting**: 20 auth attempts / 15 min; 200 global requests / 15 min
- **Helmet.js** sets CSP, HSTS, X-Frame-Options, and other security headers
- **CORS** whitelisting via `CLIENT_ORIGIN` environment variable
- **SameSite cookies** for CSRF protection

---

## Atlas AI Advisor

Atlas uses the Claude API to provide contextual financial guidance. On every chat message it receives:

- Current net worth and account balances
- Last 30 days of transactions
- Top holdings
- Cashflow metrics

It also generates three **Discovered Insights** (info / warning / opportunity) based on the user's live data. Conversation history is persisted per user in MongoDB.

---

## Deployment

The app is designed to run on Heroku, Railway, or any Node.js host.

**Checklist:**
- Set `NODE_ENV=production`
- Set `MONGO_URI` to your Atlas connection string
- Use strong, random values for `JWT_SECRET` and `JWT_REFRESH_SECRET`
- Set `CLIENT_ORIGIN` to your frontend domain for CORS
- Ensure HTTPS is active (helmet enforces secure cookies automatically)

---

## Roadmap

- [ ] Activate Yodlee Open Banking integration (infrastructure already in place)
- [ ] Cron job to auto-snapshot portfolio history for charts
- [ ] Atlas anomaly detection model
- [ ] Multi-currency support (currently ZAR)
- [ ] Mobile app (API supports Bearer token auth)
