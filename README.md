# STRIDEX — RESTful API & Cloud Backend Engine

<div align="center">

### *Powering the Next Generation of Footwear Retail*
**Enterprise-Grade Node.js, Express, TypeScript & MongoDB Architecture**  
*Rapid Application Development (RAD) Coursework*

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.1-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MongoDB Atlas](https://img.shields.io/badge/MongoDB_Atlas-7.0-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Mongoose](https://img.shields.io/badge/Mongoose-9.1-880000?logo=mongoose&logoColor=white)](https://mongoosejs.com/)
[![Supabase](https://img.shields.io/badge/Supabase_Storage-Cloud-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-3.5_Flash-4285F4?logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![Groq](https://img.shields.io/badge/Groq_LPU-openai/gpt--oss--120b-F55036?logo=fastapi&logoColor=white)](https://groq.com/)

</div>

---

## 📌 Project Overview

The **STRIDEX Backend Engine** is an enterprise-ready, stateless REST API server built from the ground up using **TypeScript, Express 5, and Mongoose 9**. It provides high-throughput transaction processing for retail footwear operations, including multi-channel payments, real-time inventory locking, cloud media storage, multi-tenant customer isolation, and an advanced **Dual-Provider AI Shopping Engine**.

All financial transactions are strictly computed in **Sri Lankan Rupees (LKR)** and formatted with decimal precision (`Rs. 12,500.00`).

---

## 🌐 Deployed Service URLs

| Environment | Service | Clickable URL | Notes |
| :--- | :--- | :--- | :--- |
| **Production** | **API Welcome Endpoint** | [https://stridex-backend-mkkz.onrender.com](https://stridex-backend-mkkz.onrender.com) | Welcome message & API status (HTTP 200) |
| **Production** | **System Health Check** | [https://stridex-backend-mkkz.onrender.com/api/health](https://stridex-backend-mkkz.onrender.com/api/health) | Live MongoDB & Uptime monitor (HTTP 200) |
| **Production** | **Catalog API Endpoint** | [https://stridex-backend-mkkz.onrender.com/api/v1/products](https://stridex-backend-mkkz.onrender.com/api/v1/products) | Footwear products endpoint (HTTP 200) |
| **Local Development** | **Local API Service** | [http://localhost:3000](http://localhost:3000) | Local development Express server |
| **Local Development** | **Local Health Check** | [http://localhost:3000/api/health](http://localhost:3000/api/health) | Diagnostic health check |

> ℹ️ **Note on API Base URL**: `https://stridex-backend-mkkz.onrender.com/api/v1` is the base router prefix utilized by the frontend Axios client. Querying `/api/v1` directly in a browser without a specific resource returns `Cannot GET /api/v1`; endpoints are accessed via their resource routes (e.g., `/api/v1/products`, `/api/v1/categories`, `/api/health`).

---

## 🛠️ Technologies & Tools Used

### Core Server & Database Layer
- **Node.js & Express 5**: Modern HTTP middleware pipeline supporting asynchronous route handlers and centralized error boundaries.
- **TypeScript**: Complete compile-time type safety and strict schema validation.
- **MongoDB Atlas & Mongoose 9**: Cloud NoSQL database with schema definitions, compound indexes, and aggregation pipelines.
- **Zod 4**: Strict incoming request payload validation and data sanitization.

### Security, Authentication & Sessions
- **Stateless JWT Tokens**: Short-lived access tokens (15 minutes) paired with cryptographic refresh tokens (7 days).
- **Role-Based Access Control (RBAC)**: Strict permission enforcement for `CUSTOMER`, `INVENTORY_MANAGER`, and `ADMIN` user roles.
- **Bcrypt.js**: Cryptographic password hashing (10 salt rounds).
- **CORS & Cookie-Parser**: Strict origin whitelisting with credential verification.

### Cloud Storage & External Services
- **Supabase Storage (`@supabase/supabase-js`)**: High-availability cloud object storage for shoe images with automated bucket provisioning (`stridex-products`).
- **Google Gemini API (`@google/genai`)**: Primary multimodal conversational model (`gemini-3.5-flash-lite`).
- **Groq Cloud SDK (`groq-sdk`)**: High-speed LPU inference engine (`openai/gpt-oss-120b`) for ultra-low latency failover.
- **Nodemailer SMTP**: Transactional email notifications for order receipts and password reset OTP verification.

---

## 🌟 Core Backend Subsystems & Features

### 1. Dual-Provider AI Shopping Assistant & Automatic Failover
- **Dual LLM Engines**: Seamlessly orchestrates **Google Gemini** and **Groq Cloud (`openai/gpt-oss-120b`)**.
- **Admin-Controlled Hierarchy**: Store administrators can dynamically designate either engine as primary via the Admin Panel; the opposite automatically becomes the backup target.
- **Transparent Failover Protection**:
  - Automatically catches temporary provider outages (HTTP 429 rate limits, HTTP 503 service delays, network timeouts) and re-routes requests to the backup provider.
  - Permanent configuration errors (invalid API keys) are preserved and never silently masked.
- **Dynamic Database Knowledge**: Analyzes incoming customer queries to retrieve matching active products, variant sizes, stock availability, brands, and categories directly from MongoDB Atlas without sending the whole database or using vector DBs/RAG.
- **Verified Order Assistance**: Authenticated customers receive live summaries of their recent orders verified strictly through `req.user.sub`. Spoofed customer IDs in message text are ignored.
- **In-Memory Rate Limiting**: Enforces a strict sliding window limit of **10 accepted messages per 10 minutes** per client. Failed provider calls do not consume customer allowance.
- **5-Exchange Short-Term Memory**: Slices conversation history to the most recent 10 messages (5 exchanges), maintaining conversation context while preventing token bloating.

### 2. Admin Bot Controls Management Subsystem
- **Persistent Model (`BotSettingModel`)**: Persists primary provider and failover toggle in MongoDB Atlas across server restarts.
- **Admin Configuration Endpoints**:
  - `GET /api/v1/admin/bot-controls/settings`: Returns active provider hierarchy, failover status, and key availability indicators without exposing credentials.
  - `PATCH /api/v1/admin/bot-controls/settings`: Validates and saves administrator overrides. Strictly protected by `authenticate` and `requireRole([UserRole.ADMIN])`.

### 3. Business Intelligence & Accurate Financial Reporting
- **Revenue Calculation Parity**: Strictly counts realized revenue from orders where `paymentStatus === 'PAID'` and `orderStatus !== 'CANCELLED'`, eliminating historical revenue leaks.
- **Granular Date Filtering**: Supports presets (`all`, `today`, `last7days`, `last30days`, `thisMonth`) and custom date ranges with inclusive end-of-day handling (`23:59:59.999`).
- **Payment Method Analytics**: Breakdowns for Cash on Delivery (COD) vs Direct Bank Transfer.
- **Warehouse Asset Valuation**: Computes inventory valuation across categories and brands, highlighting healthy stock, low-stock, and out-of-stock counts.

### 4. Footwear Catalog & Inventory Matrix
- **Parent-Variant Architecture**: Products hold general specifications (title, brand, category, base price, discount price, description, images); Product Variants hold specific size (`38`–`46`), color, and stock quantities.
- **Automated Stock Restoration**: If an order is cancelled, stock quantities are restored to variants with idempotent flags preventing duplicate restorations.
- **Cloud Media Uploads**: Accepts multipart/form-data images, uploads to Supabase Storage, and saves public CDN URLs.

### 5. Orders & Multi-Channel Payment Verification
- **Cash on Delivery (COD)**: Supports doorstep settlement across Sri Lanka with order status stepping (*Pending &rarr; Confirmed &rarr; Processing &rarr; Shipped &rarr; Delivered*).
- **Direct Bank Transfer**: Generates pending orders awaiting administrative review of bank payment receipts.
- **Order Timeline Audit Ledger**: Records timestamps, status transitions, and audit titles for complete customer tracking.

### 6. Recipient-Only Digital Gift Vouchers
- **Dedicated Recipient Security**: Vouchers purchased in fixed denominations (Rs. 2,500 – Rs. 15,000) are assigned to a verified recipient email.
- **Secret Code Masking**: The 16-character redemption code is visible exclusively to the recipient; purchasers can inspect purchase status without revealing the code.
- **Redemption Validation**: Validates recipient email, active status, expiration date, and single-use constraints at cart and checkout.

---

## 📁 Backend Directory Structure

```text
Shoe_Store_Backend/
├── assets/                      # Static branding and mascot images
├── src/
│   ├── config/                  # MongoDB Atlas connection & Supabase client
│   ├── controllers/             # Express route controllers:
│   │   ├── adminDashboard.controller.ts
│   │   ├── adminUser.controller.ts
│   │   ├── ai.controller.ts
│   │   ├── auth.controller.ts
│   │   ├── botSetting.controller.ts
│   │   ├── brand.controller.ts
│   │   ├── cart.controller.ts
│   │   ├── category.controller.ts
│   │   ├── coupon.controller.ts
│   │   ├── giftVoucher.controller.ts
│   │   ├── inventory.controller.ts
│   │   ├── order.controller.ts
│   │   ├── product.controller.ts
│   │   ├── productVariant.controller.ts
│   │   ├── review.controller.ts
│   │   ├── upload.controller.ts
│   │   └── wishlist.controller.ts
│   ├── middleware/              # Auth guard, RBAC role guard, multer upload, error handler
│   ├── models/                  # Mongoose data schemas & TypeScript interfaces:
│   │   ├── botSetting.model.ts
│   │   ├── brand.model.ts
│   │   ├── cart.model.ts
│   │   ├── category.model.ts
│   │   ├── coupon.model.ts
│   │   ├── giftVoucher.model.ts
│   │   ├── order.model.ts
│   │   ├── passwordResetOtp.model.ts
│   │   ├── product.model.ts
│   │   ├── productVariant.model.ts
│   │   ├── review.model.ts
│   │   ├── stockMovement.model.ts
│   │   ├── user.model.ts
│   │   ├── voucherRedemption.model.ts
│   │   └── wishlist.model.ts
│   ├── routes/                  # Express route routers
│   ├── scripts/                 # Seeders & automated verification test suites
│   ├── service/                 # AI chat, email sender, Supabase storage services
│   ├── types/                   # TypeScript interfaces, JWT payloads, and enums
│   ├── util/                    # JWT sign/verify, slugify, and crypto helpers
│   ├── validators/              # Zod validation schemas
│   ├── app.ts                   # Express application middleware pipeline
│   ├── index.ts                 # Server bootstrap
│   └── server.ts                # HTTP listener & database connection
├── .env.example                 # Environment configuration template
├── package.json                 # Dependencies and execution scripts
└── tsconfig.json                # TypeScript compiler configuration
```

---

## 🚀 Setup & Installation Instructions

### Prerequisites
- **Node.js**: `v18.0.0` or higher
- **npm**: `v9.0.0` or higher
- **MongoDB**: MongoDB Atlas Cluster connection URI (or local MongoDB 6+)
- **Supabase**: Project URL and service role key for object storage

### 1. Navigate to Backend Directory
```bash
cd Shoe_Store_Backend
```

### 2. Install Project Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a local `.env` file from the variables:

```bash
cp .env.example .env
```

> **Security Warning**: Never commit your actual `.env` file to Git. All credentials should be kept private on your secure server.

### 4. Seed the Database
Populate your database with administrative roles and the footwear catalog:

```bash
# Seed initial administrator and manager role accounts
npm run seed:admin

# Seed shoe categories, brands, products, and variants
npm run seed:catalog
```

### 5. Run the Server

**Development Mode (with auto-reload):**
```bash
npm run dev
```

**Production Mode:**
```bash
npm run build
npm start
```
The server will start listening at:  
👉 **`http://localhost:3000`**  
Diagnostic health check:  
👉 **`http://localhost:3000/api/health`**

---

## 📋 REST API Route Catalogue

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | System and database diagnostic check |
| `POST` | `/api/v1/auth/register` | Public | Register new customer account |
| `POST` | `/api/v1/auth/login` | Public | Authenticate user & issue JWT tokens |
| `POST` | `/api/v1/auth/refresh` | Public | Issue new access token using refresh token |
| `POST` | `/api/v1/auth/logout` | Authenticated | Revoke refresh token and terminate session |
| `POST` | `/api/v1/ai/chat` | Public / Auth | AI Shopping Assistant conversation |
| `GET` | `/api/v1/admin/bot-controls/settings` | Admin Only | Retrieve primary/backup bot status & models |
| `PATCH` | `/api/v1/admin/bot-controls/settings` | Admin Only | Update primary provider & backup failover |
| `GET` | `/api/v1/products` | Public | Search and list shoes with pagination & filters |
| `GET` | `/api/v1/products/:slug` | Public | Retrieve single product details and variants |
| `POST` | `/api/v1/products` | Admin Only | Create new shoe product |
| `PUT` | `/api/v1/products/:id` | Admin Only | Update existing shoe product |
| `DELETE` | `/api/v1/products/:id` | Admin Only | Deactivate/remove shoe product |
| `POST` | `/api/v1/upload/single` | Admin / Manager | Upload shoe image to Supabase Storage |
| `GET` | `/api/v1/cart` | Authenticated | Retrieve customer's isolated cart |
| `POST` | `/api/v1/cart/items` | Authenticated | Add footwear variant to cart |
| `GET` | `/api/v1/wishlist` | Authenticated | Retrieve customer's wishlist items |
| `POST` | `/api/v1/wishlist/toggle` | Authenticated | Toggle shoe item in customer wishlist |
| `POST` | `/api/v1/orders` | Authenticated | Place new order (COD or Bank Transfer) |
| `GET` | `/api/v1/orders/my-orders` | Authenticated | List verified orders for authenticated user |
| `GET` | `/api/v1/admin/dashboard/stats` | Admin Only | Financial KPIs & sales charts |
| `GET` | `/api/v1/admin/dashboard/reports/sales` | Admin Only | Filtered sales report with date boundaries |
| `GET` | `/api/v1/admin/dashboard/reports/inventory` | Admin Only | Inventory valuation and stock health audit |
| `GET` | `/api/v1/vouchers` | Authenticated | List customer redeemable vouchers |
| `POST` | `/api/v1/vouchers/purchase` | Authenticated | Purchase recipient-assigned gift voucher |
| `POST` | `/api/v1/vouchers/redeem` | Authenticated | Redeem 16-character voucher code at checkout |

---

## 🔒 Security & Privacy Notice

- **No Hardcoded Credentials**: API keys, database connection strings, and secrets are strictly excluded from source control.
- **Environment Isolation**: The application exclusively loads credentials via standard process environment variables.
- **Stateless Authorization**: Passwords are never stored in plaintext; all password fields utilize salted bcrypt hashing.

---

## 📄 License & Attribution

Developed as part of the **Rapid Application Development (RAD)** coursework. All brand marks and product silhouettes belong to their respective trademark owner and are utilized for academic demonstration purposes.
