# NagrikQ — Backend API Service

Node.js + Express + TypeScript REST API service for NagrikQ, with Supabase Auth verification, Role-Based Access Control (RBAC), and transactional queue management.

## Setup & Run Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
PORT=5000
SUPABASE_URL=https://fcsrwywlhmcusqababtq.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
CLIENT_ORIGIN=http://localhost:5173
```

### 3. Start Development Server
```bash
npm run dev
```

The API will be available at: `http://localhost:5000`

### 4. Build for Production
```bash
npm run build
npm start
```

## API Endpoints

| Method | Endpoint | Description | Auth / Role |
|--------|----------|-------------|-------------|
| GET | `/health` | Healthcheck status | Public |
| GET | `/api/services` | Service catalog | Public |
| GET | `/api/services/:id` | Service details & requirements | Public |
| POST | `/api/applications` | Submit application | Authenticated |
| GET | `/api/applications` | List citizen applications | Authenticated |
| POST | `/api/queue/token` | Issue virtual token | Authenticated |
| GET | `/api/queue/live` | Live queue status & ETA | Authenticated |
| POST | `/api/queue/next` | Call next citizen to counter | Employee / Admin |
| PATCH | `/api/applications/:id/status` | Update application status | Employee / Admin |
| POST | `/api/change-requests` | Create requirement Change Request | Admin / Super Admin |
| PATCH | `/api/change-requests/:id/review` | Approve/Reject Change Request | Super Admin |
| GET | `/api/audit-logs` | Fetch system audit logs | Admin / Super Admin |
