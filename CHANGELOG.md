# Changelog

## [1.0.1] - 2026-07-13

### 🐛 Fixes

- **History panel**: Artık request gönderildiğinde otomatik güncelleniyor, reload gerekmiyor ([#history])
- **Sağ panel (Response)**: `minSize="20%"` → `minSize="350px"` — dar ekranda çok küçülmüyor
- **Sol panel (RequestBuilder)**: `minSize="20%"` → `minSize="400px"` — kullanılamaz hale gelmiyor
- **Tüm layout'lar**: `overflow-hidden` eklendi — dar ekranda taşma engellendi (Layout, HTTP, Replay, gRPC, GraphQL)
- **TabBar düzeni**: overflow koruması eklendi

---

## [1.0.0] - 2026-07-04

### 🎉 Initial Stable Release

After extensive development and testing, siReq reaches its first stable release! Over 1,100+ tests (892 frontend + 226 Rust backend) with 96.97% code coverage.

### ✨ Key Features

**Protocol Support**
- HTTP/HTTPS with all methods (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, TRACE)
- GraphQL client with schema introspection, SDL parsing, and WebSocket subscriptions
- gRPC client with proto file parsing, server reflection, and all streaming types (unary, server, client, bidirectional)
- WebSocket client with real-time messaging and environment variable resolution

**Developer Tools**
- Visual Chaining Flow Editor with 8 node types, sandboxed QuickJS execution, and debugger
- Smart Mock Server (up to 5 concurrent servers) with OpenAPI/collection import, faker templates, and latency profiles
- Benchmark Tool with configurable iterations, percentile stats, and distribution charts
- Collection Runner with Functional, Smoke, Regression, and Load test modes
- ReplayLab for HAR file import, replay execution, chaos testing, and diff analysis
- API Intelligence dashboard with endpoint analytics and performance insights
- API Contract Testing with OpenAPI/Pact-style validation

**Request Management**
- Collections with nested folders and collection-level auth/variables
- Environments with scoped and global variables
- Pre-request and post-response JavaScript scripting (QuickJS sandbox)
- JSONPath variable extraction with quick-add pattern buttons
- Import from cURL, OpenAPI, and Postman; export to Postman format
- OAuth 2.0 / OIDC support (Client Credentials, Authorization Code, PKCE)

**Security & Privacy**
- Local-first storage with SQLite database
- AES-256-GCM encryption for secret variables
- Content Security Policy (CSP) hardening
- No telemetry, no cloud sync, no analytics

**User Experience**
- 12 built-in themes (Dark, Light, Nordic, Sunset, Midnight, Monochrome, Terminal, True Dark, Matrix, Solarized, Nord, System)
- Resizable panels, tab-based workflow, command palette (Ctrl+K)
- Keyboard shortcuts dialog (?), toast notifications
- Auto-update mechanism via Tauri updater plugin

### 📦 Installation

- **macOS**: macOS 12+ (Intel & Apple Silicon)
- **Windows**: Windows 10/11 (x64)
- **Linux**: Debian/Ubuntu/Arch (AppImage, deb)

### 🔧 Tech Stack

- **Frontend**: React 19, TypeScript 6.0, Vite 8, Tailwind CSS v4, Zustand, CodeMirror 6
- **Backend**: Rust, Tauri v2, reqwest, tokio, rusqlite (SQLite), tonic (gRPC), rquickjs (QuickJS), axum (mock server)
- **Security**: AES-256-GCM encryption, CSP hardening

---

## [0.7.0] - 2026-06

- Added unified test suite runner (Functional, Smoke, Regression, Load modes)
- Implemented ReplayLab with HAR import, streaming execution, diff engine
- Enhanced test coverage across all stores (892 frontend tests, 226 Rust tests)
- Improved browser-safety with safeInvoke wrapper
- Various bug fixes and performance improvements

## [0.5.5] - 2026-05

- ReplayLab streaming execution with pause/resume/cancel
- Enhanced CodeMirror theme integration
- Collection management improvements
- VariablesViewer component and runner chain utilities

## [0.5.0] - 2026-05

- ReplayLab foundation (sessions, entries, runs)
- Streaming replay functionality
- Multiple theme updates

## [0.4.0] - 2026-04

- Visual Chaining Flow Editor with 8 node types
- API Contract Testing (OpenAPI/Pact-style)
- OAuth 2.0 / OIDC support
- WebSocket store tests
- Smart Mock Server with log viewer and scenario management

## [0.3.0] - 2026-03

- gRPC client with proto parsing and streaming
- GraphQL client with schema explorer and subscriptions
- WebSocket client
- CI/CD workflows (GitHub Actions)

## [0.2.0] - 2026-02

- HTTP request builder (methods, body types, auth)
- Response viewer (pretty, raw, preview, headers, cookies, diff, schema)
- Collections and environments
- Pre-request and post-response scripting
- cURL/OpenAPI/Postman import
- Benchmark tool
- Theme system

## [0.1.0] - 2026-01

- Initial project setup
- Tauri v2 + React 19 foundation
- Basic HTTP request sending
- SQLite database layer
- Variable resolution engine
