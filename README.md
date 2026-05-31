<p align="center">
  <img src="./docs/logo.svg" alt="siReq Logo" width="160" />
</p>

<div align="center">
  <h1>siReq</h1>
  <h3>A modern, high-performance desktop API client</h3>
  <p>HTTP · GraphQL · gRPC · WebSocket · Scripting · Benchmarking · API Intelligence · ReplayLab</p>
</div>

<p align="center">
  <img src="./docs/screenshots/hero-overview.png" alt="siReq — Modern API Client" width="1200" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2-FFC131?logo=tauri&logoColor=white" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/Rust-1.77-000000?logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-8-B73BFE?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS v4" />
  <img src="https://img.shields.io/badge/SQLite-bundled-003B57?logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/Desktop_API_Client-✓-success" alt="Desktop API Client" />
  <img src="https://img.shields.io/badge/Cross_Platform-Windows_|_macOS_|_Linux-important" alt="Cross Platform" />
</p>

---

## Why siReq?

**siReq** is a full-featured, native desktop API client built with **Tauri v2** (Rust) and **React 19** (TypeScript). It brings the power of Postman-like workflows into a lightweight, high-performance desktop application — without the bloat.

- **⚡ Native performance** — Rust-powered backend with no Electron overhead
- **🔧 One tool for everything** — HTTP, gRPC, WebSocket, benchmarking, scripting, mock servers, collections, visual flows, and API analytics
- **🔒 Local-first** — All data stored locally in SQLite with encrypted secrets
- **🤖 Automation-ready** — Variables, JavaScript scripting, data-driven runs, JSONPath variable extraction, and visual chaining flow graphs
- **🎨 Modern UX** — 12 themes, interactive grid canvas, resizable panels, shortcuts, command palette, and tabbed workflows
- **🔄 Interoperable** — Import from cURL, OpenAPI, and Postman; export to Postman format

---

## Table of Contents

- [Features at a Glance](#features-at-a-glance)
- [Screenshots](#screenshots)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Detailed Features](#detailed-features)
  - [HTTP Requests](#http-requests)
  - [Response Viewer](#response-viewer)
  - [Collections](#collections)
  - [Environments & Variables](#environments--variables)
  - [Scripting & Automation](#scripting--automation)
  - [Import / Export](#import--export)
  - [GraphQL Client](#graphql-client)
  - [gRPC Client](#grpc-client)
  - [WebSocket Client](#websocket-client)
  - [Smart Mock Server](#smart-mock-server)
  - [Visual Chaining Flow Editor](#visual-chaining-flow-editor)
  - [Benchmark Tool](#benchmark-tool)
  - [Collection Runner](#collection-runner)
  - [API Intelligence](#api-intelligence)
  - [ReplayLab](#replaylab)
  - [UI / UX](#ui--ux)
- [Tech Stack](#tech-stack)
- [Data Persistence & Security](#data-persistence--security)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

---

## Features at a Glance

### HTTP & Response Inspection

| Feature | Details |
|---------|---------|
| **Methods** | GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, TRACE |
| **Body types** | None, JSON, XML, Text, Form Data (multipart), Form URL-encoded |
| **Auth** | None, Basic, Bearer Token, API Key, and Enterprise OAuth 2.0 / OIDC Client |
| **Request settings** | Timeout, follow redirects, SSL verification, proxy support |
| **Response viewer** | Pretty-print, raw, preview (images/PDF); syntax highlighting; find-in-page; headers, cookies, diff view, JSON schema viewer |
| **Tabs** | Multi-request tab interface with duplicate and rename |

### Collections & Environments

- Tree-based collection organization with nested folders
- Collection-level auth and variables
- Environment management with scoped variables
- Global variables shared across all requests
- Secret variable encryption (AES-256-GCM)

### Scripting & Automation

- **Pre-request scripts** — Modify requests before sending, set variables, log output
- **Post-response scripts** — Test assertions, extract data, write tests
- **Postman-like API** — Familiar `pm.*` scripting interface
- **Request chaining / Variable extraction** — Extract values from JSON responses via JSONPath expressions. Configure extractions with quick-add pattern buttons in the Scripts tab. Extracted variables are automatically stored in the active environment and available as `{{variable_name}}` in subsequent requests.
- **Extraction pipeline** — Response → Extract with JSONPath → Variable stored → Toast notification → Vars tab in response viewer → Use `{{variable}}` in next request
- **Dynamic variables** — `{{$timestamp}}`, `{{$uuid}}`, and custom `{{variable}}` resolution

### Imports & Interoperability

- cURL command import
- OpenAPI / Swagger spec import → collection generation
- Postman collection import and export

### GraphQL, gRPC & WebSocket

- **GraphQL**: Schema Introspection & visual explorer, SDL schema parser, CodeMirror autocomplete/linting editor, JSON variables editor, custom Auth & Headers, HTTP query/mutation sending, and `graphql-ws` WebSocket subscriptions
- **gRPC**: Parse `.proto` files, server reflection, unary/server-streaming/client-streaming/bidirectional streaming calls, TLS support
- **WebSocket**: Connect to `ws://`/`wss://` endpoints, send/receive messages, real-time log, environment variable resolution

### Visual Chaining Flow Editor

- **Interactive Node-Graph** — Drag and drop workspace with dot-grid backdrop, 10px snap alignment, **multi-node rectangle selection (Shift+drag)**, custom drag-to-connect wire handles, and smooth mouse-wheel panning/zooming.
- **Dynamic Bezier Paths** — Fluid cubic Bezier wires linking ports. Supports active **neon traveling pulse animations** along wire routes to show real-time signal flows!
- **Expanded Node Types** — Start triggers, HTTP Request nodes (with JSONPath response extractions), wait delay timers, JS conditional branching logic nodes, **Set Variable** nodes, **Script** nodes (custom JS execution), **Assertion** nodes (boolean validation), and format-ready Console Loggers.
- **Sandboxed Execution Engine** — All script, condition, and assertion evaluations run in an isolated QuickJS sandbox with full flow variable access. Features **execution cancellation** (stop in-flight flows), **request snapshotting** for offline-capable execution, and **built-in flow validation**.
- **Undo/Redo & Clipboard** — Full history-based undo/redo stack (Ctrl+Z, Ctrl+Shift+Z). Copy/paste nodes and selections across the canvas (Ctrl+C, Ctrl+V). Select-all with Ctrl+A.
- **Flow Validation & Runner Integration** — Built-in `validateFlow()` checks for missing Start nodes, unlinked requests, and disconnected paths before execution. Launch any flow directly into the **Collection Runner** for data-driven runs with CSV/JSON datasets.
- **Integrated Debug HUD** — Collapsible monospaced Flow Debugger Terminal, live variables context list with `{{placeholder}}` display, and granular node inspectors.

### Smart Mock Server

- **Multi-Server Orchestrator** — Spin up up to 5 local mock servers concurrently on custom TCP ports
- **OpenAPI & Collection Import** — Automatically map OpenAPI v2/v3 spec files or existing HTTP collections into fully-featured mock servers with endpoints, paths, methods, and mock scenarios in seconds
- **Dynamic Scenarios** — Add multiple conditional scenarios per endpoint, configuring custom status codes, headers, and response bodies
- **Request Matching Rules** — Route to specific scenarios based on headers, query parameters, full request body, or complex JSONPath matching
- **Response Templating** — Procedurally generate mock data with inline `{{faker.uuid}}`, `{{faker.name}}`, `{{faker.email}}`, `{{faker.integer(min,max)}}` variables, or dynamically echo request path, queries, headers, and body elements (via JSONPath)
- **CORS & Global Headers** — Configure CORS parameters (origins, methods, credentials, allowed headers) and global response headers per server
- **Real-Time Logs & Statistics** — Inspect live logs in a streaming console, view transaction details, warning banners for broken templates, and live metrics (Req/Err count, avg latency)
- **Latency Profiles** — Simulate real-world network latency using fixed delays, random ranges, or normal distribution profiles


### Benchmarking & Intelligence

- **Benchmark tool**: Run 1–1000 iterations, get min/max/avg/median/P95/P99 stats, distribution chart, status code analysis, result comparison
- **Collection runner**: Sequential collection execution with configurable delay, stop-on-failure, data-driven runs (CSV/JSON)
- **API Intelligence**: Analyze request history, endpoint insights, performance trends, schema evolution, regression detection
- **ReplayLab**: Import HAR files, replay HTTP sessions with diff detection, chaos testing, waterfall visualization, run comparison, drag-and-drop entry reordering, streaming execution with pause/resume/cancel, and full entry editing

### UI, Themes & Productivity

- 12 built-in themes (Dark, Light, Nordic, Sunset, Midnight, Monochrome, Terminal, True Dark, Matrix, Solarized, Nord, System)
- Resizable panels, command palette (<kbd>Ctrl+K</kbd>), keyboard shortcuts dialog (<kbd>?</kbd>)
- Toast notifications, first-class dark mode support

---

## Screenshots

Here are some screenshots of siReq in action across its various features and panels.

### Main Workspace

<p align="center">
  <img src="./docs/screenshots/hero-overview.png" alt="siReq main workspace with sidebar, request builder, and response viewer" width="1200" />
</p>

### HTTP Request Builder

<p align="center">
  <img src="./docs/screenshots/request-builder.png" alt="HTTP request builder with method selector, URL bar, headers, and JSON body editor" width="1000" />
</p>

### Response Viewer

<p align="center">
  <img src="./docs/screenshots/response-viewer.png" alt="Response viewer with formatted JSON body, stats bar, and response tabs" width="1000" />
</p>

### Collections & Environments

<p align="center">
  <img src="./docs/screenshots/collections-tree.png" alt="Collection tree with folders, saved requests, and environment selector" width="1000" />
</p>

### Scripts & Variables

<p align="center">
  <img src="./docs/screenshots/scripts-variables.png" alt="Pre-request and post-response scripting with variable extraction" width="1000" />
</p>

### Request Chaining / Variable Extraction

<p align="center">
  <img src="./docs/screenshots/request-chaining-scripts.png" alt="Quick-add extraction pattern buttons in the Scripts tab — Extract ID, Token, Data, Email, User ID, and First Item" width="1000" />
</p>

<p align="center">
  <img src="./docs/screenshots/response-vars-tab.png" alt="Vars tab showing extracted variables with copy-to-clipboard and usage guidance" width="1000" />
</p>

### Import Tools

<p align="center">
  <img src="./docs/screenshots/import-tools.png" alt="cURL, OpenAPI, and Postman import buttons in the sidebar" width="1000" />
</p>

### gRPC Panel

<p align="center">
  <img src="./docs/screenshots/grpc-panel.png" alt="gRPC client with proto file editor, method tree, and response panel" width="1000" />
</p>

### WebSocket Client

<p align="center">
  <img src="./docs/screenshots/websocket-panel.png" alt="WebSocket client with connection controls and real-time message log" width="1000" />
</p>

### Benchmark Results

<p align="center">
  <img src="./docs/screenshots/benchmark-results.png" alt="Benchmark results with stats cards, distribution chart, and history sidebar" width="1000" />
</p>

### Collection Runner

<p align="center">
  <img src="./docs/screenshots/collection-runner.png" alt="Collection runner with configuration options, results table, and run history" width="1000" />
</p>

<p align="center">
  <img src="./docs/screenshots/collection-runner-extracted-vars.png" alt="Collection runner — extracted variables grouped by request with chain flow visualization" width="1000" />
</p>

<p align="center">
  <img src="./docs/screenshots/collection-runner-chain-vars.png" alt="Collection runner — expanded inline chain variable details showing request-to-request variable flow" width="1000" />
</p>

### API Intelligence

<p align="center">
  <img src="./docs/screenshots/api-intelligence.png" alt="API Intelligence dashboard with endpoint insights and performance charts" width="1000" />
</p>

### Themes & Settings

<p align="center">
  <img src="./docs/screenshots/themes-settings.png" alt="Settings drawer with 12 theme options and request configuration" width="1000" />
</p>

---

## Installation

### Prerequisites

- **Node.js** 18+ (recommended: 20+)
- **Rust** stable toolchain (install via [rustup](https://rustup.rs/))
- **Tauri v2 system prerequisites** — See the [official Tauri guide](https://v2.tauri.app/start/prerequisites/) for your platform

### Clone & Install

```bash
git clone <repository-url>
cd siReq
npm install
```

### Run in Development

```bash
npx tauri dev
```

This launches the desktop application with hot-reload for both the Rust backend and the React frontend.

### Frontend-Only Development

```bash
npm run dev
```

Starts only the Vite dev server. Note that Tauri commands (`invoke`) will not be available — use this for UI-only work.

### Build for Production

```bash
npm run build        # Build the frontend
npx tauri build      # Build the desktop app installer
```

---

## Quick Start

1. **Launch the app** — Run `npx tauri dev`
2. **Select or create an environment** — Click the environment dropdown in the sidebar
3. **Enter a URL** — Type `https://jsonplaceholder.typicode.com/posts/1` in the URL bar
4. **Select a method** — Default is GET
5. **Send the request** — Click **Send** or press <kbd>Ctrl+Enter</kbd>
6. **Inspect the response** — View the formatted JSON body, headers, cookies, and stats
7. **Save to collection** — Click the **Collections** tab in the sidebar and create/save your request
8. **Organize** — Create folders, add more requests, and run them all with the Collection Runner

---

## Detailed Features

### HTTP Requests

siReq supports the full HTTP method set: **GET**, **POST**, **PUT**, **PATCH**, **DELETE**, **HEAD**, **OPTIONS**, and **TRACE**.

**Request building includes:**

- **URL Bar** — Integrated method selector + URL input + send button in one compact bar
- **Query Parameters** — Key-value editor with enable/disable toggles
- **Headers** — Key-value editor with enable/disable, common headers auto-suggested
- **Body** — Supports multiple content types:
  - **None** — No body (GET, HEAD, etc.)
  - **JSON** — Syntax-highlighted editor with formatting
  - **XML** — Syntax-highlighted editor
  - **Text** — Plain text input
  - **Form Data** — Multipart form with file upload support
  - **Form URL-encoded** — URL-encoded key-value pairs
- **Auth** — Built-in authentication:
  - **Basic Auth** — Username and password
  - **Bearer Token** — Token-based authorization
  - **API Key** — Pass as header or query parameter
  - **OAuth 2.0 & OIDC Client** — Enterprise-grade client-side OAuth flow engine with support for:
    - **Client Credentials** flow (direct token endpoint requests)
    - **Authorization Code** flow
    - **Authorization Code with PKCE** (Proof Key for Code Exchange) flow
    - **S256 PKCE Generator** using browser-native WebCrypto APIs
    - **CORS-Free Backend Routing** via the native Rust `reqwest` engine to prevent browser blockages
    - **Interactive Callback Auto-Parser** for pasting and extracting auth code parameter URLs
    - **Token HUD Panel** with expiration countdowns, secure masking, copying, and clearing/revocation
- **Settings** — Timeout (1–600s), follow redirects, SSL verification toggle, proxy configuration (URL + optional authentication)
- **Cancel** — Cancel an in-flight request at any time
- **Copy as cURL** — Generate a cURL command from the current request
- **Request Name** — Optional label for saved requests

### Response Viewer

After sending a request, the response panel displays:

- **Status Bar** — Color-coded status code and status text, response time (ms), response size
- **Body** — Multiple viewing modes:
  - **Pretty** — Formatted with syntax highlighting (JSON, XML, HTML, JavaScript, CSS auto-detected)
  - **Raw** — Unformatted plain text
  - **Preview** — Image rendering and PDF viewer for binary responses
  - **Find-in-page** — Search within the response body
  - **Virtualized rendering** — For large responses (100k+ characters)
- **Headers** — Table of response headers with key-value pairs
- **Cookies** — Parsed cookies from `Set-Cookie` headers
- **Diff** — Compare current response with the previous response (line-by-line diff)
- **Schema** — JSON schema viewer for API responses
- **Extracted Variables** — "Vars" tab displays all variables extracted/modified by post-response scripts, with copy-to-clipboard for `{{variable_name}}` syntax and usage guidance. A cyan badge in the stats bar shows the variable count for quick access.
- **Copy** — Copy response body to clipboard
- **Save** — Download binary responses (images, PDFs)

### Collections

Organize your API requests into collections:

- **Tree structure** — Nested folders and requests
- **Create, edit, delete** — Full CRUD for collections, folders, and requests
- **Move items** — Reorganize by moving items between folders
- **Collection-level auth & variables** — Shared across all collection items
- **Postman-compatible** — Import and export Postman collections

### Environments & Variables

Manage configuration across different contexts:

- **Environments** — Create separate environments (e.g., development, staging, production)
- **Variables** — Key-value pairs with enable/disable toggle
- **Global variables** — Shared across all environments
- **Variable resolution** — Use `{{variableName}}` syntax in URLs, headers, body, and auth fields
- **Dynamic variables** — Built-in helpers:
  - `{{$timestamp}}` — Current Unix timestamp
  - `{{$uuid}}` — Random UUID v4
  - `{{$randomInt}}` — Random integer (0–1000)
  - `{{$randomInt N,M}}` — Random integer in range [N, M]
  - `{{$randomString}}` — Random 8-character alphanumeric string
  - `{{$randomString N}}` — Random N-character alphanumeric string
  - `{{$randomEmail}}` — Random email address
  - `{{$guid}}` — Random UUID v4 (alias for `$uuid`)
  - `{{$timestamp ms}}` — Current Unix timestamp in milliseconds
- **Secret storage** — Variables can be marked as secrets and encrypted at rest (AES-256-GCM)
- **Script-modified variables** — Pre-request scripts can set variables that flow into the request and post-response scripts

### Scripting & Automation

siReq embeds a **QuickJS** JavaScript engine for request and response scripting:

- **Pre-request scripts** — Execute JavaScript before sending the request to:
  - Modify request headers, body, URL, or auth
  - Set environment variables dynamically
  - Log debugging information
- **Post-response scripts** — Execute JavaScript after receiving the response to:
  - Write test assertions with pass/fail results
  - Extract values from the response body
  - Set variables for subsequent requests
- **Script API** — Familiar Postman-like interface:
  - `pm.request` — Access and modify the outgoing request
  - `pm.response` — Access the received response
  - `pm.variables` — Get and set variables
  - `pm.test()` — Define test cases
  - `console.log()` — Output debugging logs
- **Variable extraction** — Configure JSONPath expressions to automatically extract values from responses into variables. Use quick-add pattern buttons (Extract ID, Token, Data, Email, User ID, First Item) for common extraction scenarios.
- **Extraction pipeline** — When a response contains extracted variables, a success toast notification shows the variable names (truncated if >3). The response viewer's "Vars" tab displays all extracted values with `{{variable_name}}` copy support, enabling seamless request-to-request data chaining.

### Import / Export

Seamlessly move data between tools:

- **cURL Import** — Paste a cURL command and siReq parses it into a fully populated request (method, URL, headers, body, auth)
- **OpenAPI / Swagger Import** — Import an OpenAPI specification (JSON or YAML) and generate a full collection with endpoints, parameters, and request schemas
- **Postman Import** — Import Postman collections (v2.1) with requests, folders, auth, and variables
- **Postman Export** — Export your siReq collections back to Postman format

### GraphQL Client

Full-featured GraphQL client for querying, mutating, and subscribing:

- **Schema Explorer** — Interactive schema navigator showing `Query`, `Mutation`, and `Subscription` entrypoints, arguments, nested field types, and descriptions.
- **Introspection & SDL** — Run schema introspection queries against your endpoint or paste a raw SDL schema string directly.
- **GraphQL Editor** — Fully featured query editor with syntax highlighting, autocomplete, and real-time schema linting (powered by CodeMirror 6).
- **Variables Editor** — Dedicated JSON variables editor with on-the-fly syntax validation.
- **Header & Auth Sections** — Configure custom HTTP headers, Bearer tokens, Basic auth, or API Keys.
- **Subscriptions** — Dynamic connection to subscription endpoints using WebSocket (`graphql-ws` protocol) with real-time log, message counters, and status indicators.
- **Collection Integration** — Fully integrated with siReq's collection list, folders, environments, and toast alerts. Auto-detects GQL queries in collections and tags them with a visual `GQL` badge.

### gRPC Client

Full gRPC support with siReq's dedicated gRPC panel:

- **Proto file parsing** — Upload and parse `.proto` files (proto2 and proto3 syntax)
- **Service reflection** — Use gRPC reflection to auto-discover services from a running gRPC server
- **Method selection** — Browse services and methods in an interactive tree
- **Input builder** — Dynamically generated form based on protobuf message fields (supports nested messages, repeated fields, maps, enums)
- **Call types** — Full support for all four gRPC streaming types:
  - **Unary** — Single request, single response
  - **Server-streaming** — Single request, stream of responses
  - **Client-streaming** — Stream of requests, single response
  - **Bidirectional streaming** — Stream of requests, stream of responses
- **TLS support** — Toggle TLS for secure connections
- **Environment variables** — Variable resolution in gRPC inputs
- **Response viewer** — JSON-formatted response with status, headers, timing, and size
- **gRPC history** — Full history of gRPC calls with search and restore

### WebSocket Client

Real-time communication testing:

- **Connect** — Connect to `ws://` and `wss://` endpoints
- **Status indicator** — Visual connection state (disconnected, connecting, connected)
- **Send messages** — Send text messages over the active connection
- **Message log** — Real-time log with timestamps, direction indicators (sent →, received ←, system ●)
- **Color-coded messages** — Sent (primary), received (accent), system (muted)
- **Clear log** — Reset the message history
- **Environment variables** — Variable resolution in WebSocket URL and sent messages
- **Tauri events** — Uses Tauri event system for real-time WebSocket communication

### Smart Mock Server

siReq integrates a local-first **Smart Mock Server** that lets you simulate mock API endpoints directly on your local machine using an Axum-powered HTTP server in Rust:

- **Automatic Mocking** — Instantly import an OpenAPI JSON/YAML specification or an existing siReq collection, and automatically generate endpoints, methods, and default response payloads
- **Lifecycle Control** — Spin servers up/down instantly with custom TCP ports (up to 5 concurrent running servers) with direct socket bind error reporting
- **Rule-Based Routing** — Create advanced condition groups. Incoming HTTP requests are matched against custom header, query param, body, or JSONPath filters, and routed to the corresponding response scenario
- **Dynamic Faker Engine** — Response templates support placeholder resolution to inject synthetic data:
  - `{{faker.uuid}}` / `{{faker.name}}` / `{{faker.email}}` / `{{faker.date}}` / `{{faker.integer(min,max)}}`
  - Dynamic request variables: `{{request.path}}`, `{{request.query.param}}`, `{{request.headers.header}}`, and `{{request.body.jsonPath}}` to mirror request data back in the response
- **Latency Emulation** — Add latency profiles to endpoints: fixed latency (e.g. `300ms`), random delay ranges (`100ms - 500ms`), or normal distribution delays (`mean: 300ms, std_dev: 50ms`) to stress-test your application
- **CORS Configurator** — Set custom CORS settings per-server, enabling seamless cross-origin request testing for local frontend dev scripts
- **Live Logs Console** — Inspect logs in real time. Filter logs by search queries, click any item to see full request/response payloads, and track aggregate counts and latencies directly in the side console

### Benchmark Tool

Performance testing for your APIs:

- **Configurable iterations** — Run 1 to 1000 requests
- **Comprehensive statistics**:
  - **Min** / **Max** / **Avg** latency
  - **Median** / **P95** / **P99** percentile latencies
  - **Success count** / **Failure count**
  - **Total bytes transferred**
  - **Success rate percentage**
- **Visual distribution** — Bar chart showing timing distribution
- **Status code analysis** — Grouped and counted status codes
- **Individual results** — Per-request timing and status table
- **History** — Full benchmark history with the ability to restore and re-examine past results
- **Compare** — Side-by-side comparison of two benchmark runs

### Collection Runner

Automate API testing with collection runs:

- **Sequential execution** — Run all requests in a collection in order
- **Configurable delay** — Add delay between requests (0ms, 100ms, 200ms, 500ms, 1s, 2s, 5s)
- **Stop on failure** — Halt execution on the first failed request
- **Data-driven runs** — Import datasets from CSV or JSON files to run the collection multiple times with different data
  - Each row in the dataset becomes a variable scope for one execution pass
  - Preview the dataset before running
- **Results table** — Detailed per-request results showing:
  - Method, name/URL, status code, response time, size
  - Test pass/fail counts
  - Extracted variables
  - Error details
- **Summary cards** — Passed, failed, total time, average time
- **Extracted variables view** — All variables extracted during the run, grouped per request with variable names, values, and chain indicators showing which variables flow between requests
- **Chain flow visualization** — Visual flow diagram showing variable movement between requests (e.g., `#1 → auth_token → #2`)
- **Interactive variable details** — Click the "N vars" badge in the results table to expand inline variable details with chaining direction indicators (`→ chained to request #X`, `← from request #X`)
- **Run history** — Full history of all collection runs with dates, pass/fail stats, and delete/clear

### Visual Chaining Flow Editor

siReq provides a state-of-the-art, GPU-accelerated **Visual Chaining Flow Editor** (Node-Graph style) to visually model, link, and automate sequential request workflows:

<p align="center">
  <img src="./docs/screenshots/flow-editor.png" alt="Visual Flow Editor showing connected Start, Request, Wait, Condition, and Console Logger nodes" width="1000" />
</p>

**Interactive Canvas & Editor features:**
- **Grid Backdrop** — Interactive vector dot-grid supporting drag-to-pan, pinch-to-zoom, and mouse scroll wheel zoom. Nodes snap to 10px coordinates for clean layouts.
- **Multi-Node Selection** — Hold **Shift** and drag to draw a rectangle and select multiple nodes. **Shift+click** toggles individual node selection. Combined selection for bulk copy, paste, delete, and move operations.
- **Cubic Bezier Wires** — Fluid connection paths linking inputs and outputs. During execution, wires trigger **neon travelers** (pulsing glowing sparks) that run along the path to illuminate downstream routes in real time!
- **Execution Debugger** — Run the entire flow visually. Nodes light up in **pulsing Cyan** when running, **Green** on success, or **Red** on failure.
- **Flow Validation** — A built-in `validateFlow()` step runs before every execution, checking for missing Start nodes, unlinked requests, disconnected paths, and other structural issues.
- **Sandboxed Execution** — All JavaScript (conditions, assertions, scripts) runs in an isolated **QuickJS sandbox** with controlled flow variable access. Execution can be **cancelled mid-flight** with automatic request abort and state cleanup.
- **Request Snapshotting** — When linking an HTTP Request node, the full request definition (URL, headers, body, method, auth) is **snapshotted** into the node data, enabling offline-capable execution without requiring open tabs.
- **Flow Debugger Terminal** — A collapsible monospaced stream panel at the bottom of the canvas displaying chronological execution steps, millisecond response speeds, data warnings, and logger outputs in real-time.
- **Live Variables Monitor** — Lists all evaluated variable states in the active flow context, displaying their drop-in `{{placeholders}}` format.
- **Toolbar Controls** — Compact toolbar with:
  - **Node Adders** — Quick-add buttons for all 8 node types
  - **View Controls** — Zoom In/Out, percentage display, Reset Zoom, **Fit to View** (auto-calculates optimal zoom/pan to show all nodes)
  - **Undo/Redo** — Full history-based undo/redo with visual stack indicators (Ctrl+Z / Ctrl+Shift+Z)
  - **Clipboard** — Copy (Ctrl+C) and Paste (Ctrl+V) with auto-offset positioning. **Select All** (Ctrl+A) for bulk operations
  - **Execution Controls** — Run, Stop (with abort), Reset execution states
  - **Runner Launch** — One-click launch into the **Collection Runner** for data-driven runs with CSV/JSON datasets
  - **Delete / Clear** — Delete selected nodes (Delete/Backspace) or clear the entire canvas

**Visual Node Types:**
- **Start Node** — Simple green glowing trigger pill starting the execution. Only one Start node allowed per flow; protected from accidental deletion.
- **HTTP Request Node** — Links to any saved workspace request or open tab (displays method badges like `GET` or `POST`, URL, and statistics). Supports **Response Extractions**: configure JSONPath expressions (e.g. `$.data.token` → `flow_token`) to automatically extract JSON values from responses into the variables stream. Stores a full **request snapshot** for offline-capable execution.
- **Wait Timer Node** — Pauses execution flow dynamically for a specified delay in milliseconds (0–60,000 ms).
- **Branch Condition Node** — Evaluates standard JavaScript conditions (e.g. `status_code === '200'`) against current variable values, branching into `True` or `False` trigger paths. Evaluated in the sandboxed engine.
- **Set Variable Node** — Assigns a value to a named flow variable. Supports `{{variable}}` interpolation for dynamic value resolution. Useful for transforming or combining extracted data mid-flow.
- **Script Node** — Executes arbitrary JavaScript code in the sandboxed QuickJS engine. Provides a `vars` object for reading and writing flow variables. Supports **two output ports**: success (green) and failure (red) based on whether the script throws an error.
- **Assertion Node** — Validates a boolean JavaScript expression (e.g. `status_code === '200'`) and provides a **custom failure message**. Branches into success (green) or failure (red) ports based on the evaluation result.
- **Console Log Node** — Formats and prints custom strings (e.g. `Received user ID: {{user_id}}`) directly to the debugger terminal. Supports `{{placeholder}}` interpolation for live variable display.

---

### API Contract Testing (OpenAPI / Pact-style Validation)

siReq features an integrated **API Contract Testing** workspace that lets you audit HTTP requests against your OpenAPI/Swagger Specifications (OAS) and run Pact-style response validations:

**Visual Binding Wizard (Request Editor):**
- **OAS Spec Binding** — A multi-step wizard tab. Paste a JSON spec and siReq instantly parses it.
- **Dynamic Endpoint Selector** — Dynamically parses and displays available **API Paths** (e.g. `/api/v1/users/{id}`), **HTTP Methods** (e.g. `GET`), and documented **Expected Response Codes** directly from the spec.
- **Recursive Reference Resolver** — Resolves and flattens all internal `$ref` schema structures (e.g. `#/components/schemas/UserProfile`) on the fly, including complex nested component mappings.
- **Automatic Sync** — Once bound, siReq automatically dereferences the schema and populates the request's existing JSON Schema editor tab, ensuring zero configuration friction.

**Pact-style Compliance Report (Response Viewer):**
- **Verification Indicator** — The Response panel's Contract tab displays a **pulsing green dot** whenever contract validation is active for a request.
- **Live Assertion Checklist** — Runs 3 comprehensive contract tests on every server response:
  1. **HTTP Status Code Compliance** — Verifies if the returned status matches expectations or is documented under the OpenAPI contract path.
  2. **Response Headers Compliance** — Verifies that the Content-Type strictly conforms to `application/json` and checks if all expected response headers specified in the contract spec are returned.
  3. **Response Body JSON Schema Compliance** — Validates the actual JSON payload structure against the dereferenced schema using the high-performance `Ajv` validator.
- **Compliance Badge HUD** — Displays a visual **"CONTRACT COMPLIANT ✓"** (neon green glowing card) or **"CONTRACT BREACHED ✗"** (neon red card listing exact missing headers, status mismatches, or AJV schema path errors) banner.

---

### API Intelligence

Analyze your API behavior over time:

- **Overview dashboard** — Aggregate statistics about your API usage
- **Endpoint insights** — Per-endpoint analysis with performance metrics
- **Endpoint detail view** — Deep dive into individual endpoints
- **Performance charts** — Latency trends over time
- **Status distribution** — Status code breakdown with charts
- **Schema evolution** — Track how API response schemas change over time
- **Performance regressions** — Automatic detection of performance degradation
- **History-driven** — All analysis is based on actual request history

### ReplayLab

siReq includes a **ReplayLab** module for importing, replaying, and diffing HTTP sessions — ideal for debugging, regression testing, and chaos engineering:

- **HAR Import** — Drag-and-drop or file-picker import of HTTP Archive (HAR) files. All entries are parsed into replay sessions with full request/response details (URL, method, headers, body, timing, status).
- **Session Management** — Create, rename, duplicate, and delete replay sessions. Each session contains an ordered list of entries (requests) and associated assertions.
- **Drag-and-Drop Reordering** — Reorder entries in the timeline by dragging and dropping. Visual feedback with drop target highlighting and grip handle indicators. Optimistic UI updates with backend sync.
- **Full Entry Editing** — Edit any imported entry's request (method, URL, headers, body, name) and response baseline (status code, body) directly in the Inspector panel. Modify baselines for accurate diff comparison.
- **Streaming Replay Execution** — Re-execute all entries with real-time progress streaming via Tauri events. Each entry result is broadcast as it completes, enabling live timeline updates.
- **Pause / Resume / Cancel** — Full playback control during replay runs:
  - **Pause** — Suspend execution between entries; the engine waits until resumed
  - **Resume** — Continue a paused replay from where it stopped
  - **Cancel** — Abort the replay run immediately; remaining entries are marked as *Skipped*
- **Environment Substitution** — `{{variable}}` and `{%variable%}` template syntax is resolved using global and environment-specific variables during replay.
- **Diff Engine** — Automatically compare replay run results against the original HAR baselines:
  - **JSON diff** — Structural key-by-key comparison with added/removed/changed detection
  - **Text diff** — Line-by-line text comparison for non-JSON bodies
  - **Header diff** — Compare response headers (added, removed, changed values)
  - **Schema drift** — Detect structural changes in JSON response schemas
- **Assertion Evaluator** — Define assertions on sessions (e.g., status code, body contains, response time threshold). Assertions are evaluated against each replay run entry with pass/fail results.
- **Waterfall Visualization** — Chrome DevTools-style latency bar chart for each replay entry, color-coded by status (green = success, red = error, yellow = warning). Shows DNS, connect, send, wait, and receive timing phases.
- **Run Comparison** — Select any two replay runs for side-by-side comparison. Per-entry deltas for status code, response time, and size. Highlight regressions and improvements.
- **Chaos Replay** — Inject controlled failures into replay runs to test resilience:
  - **Timeout injection** — Configurable probability of forcing request timeouts
  - **Latency injection** — Add random delays to simulate slow networks
  - **Error injection** — Configurable probability of simulating server errors
- **URL Remapping** — Map original HAR URLs to different target URLs (e.g., production → staging) before replaying
- **Immutable Run History** — All past replay runs are stored with full results for auditing and comparison

### UI / UX

Designed for productivity:

- **12 themes** — Dark, Light, Nordic, Sunset, Midnight, Monochrome, Terminal, True Dark, Matrix, Solarized, Nord, and System (follows OS preference)
- **Resizable panels** — Drag-to-resize request/response panels and sidebar
- **Tab-based workflow** — Multiple requests open simultaneously in tabs
- **Keyboard shortcuts**:
  - <kbd>Ctrl+Enter</kbd> — Send request
  - <kbd>Ctrl+L</kbd> — Focus URL bar
  - <kbd>Ctrl+N</kbd> — New request
  - <kbd>Ctrl+T</kbd> — New tab
  - <kbd>Ctrl+W</kbd> — Close current tab
  - <kbd>Ctrl+Tab</kbd> / <kbd>Ctrl+Shift+Tab</kbd> — Switch tabs
  - <kbd>Ctrl+B</kbd> — Toggle sidebar
  - <kbd>Ctrl+K</kbd> — Command palette
  - <kbd>?</kbd> — Keyboard shortcuts dialog
  - <kbd>Ctrl+Alt+H</kbd> — HTTP mode
  - <kbd>Ctrl+Alt+W</kbd> — WebSocket mode

- **Command palette** (<kbd>Ctrl+K</kbd>) — Quick access to all major actions
- **Toast notifications** — Non-intrusive feedback for actions
- **Responsive layout** — Adaptive design for different window sizes

---

## Tech Stack

### Frontend

| Technology | Purpose |
|-----------|---------|
| **React 19** | UI framework |
| **TypeScript** | Type-safe JavaScript |
| **Vite 8** | Build tool and dev server |
| **Tailwind CSS v4** | Utility-first styling |
| **Zustand** | State management with persistence |
| **Radix UI** | Accessible UI primitives (dialog, select, tabs, tooltip, etc.) |
| **CodeMirror 6** | Code editor, GraphQL autocomplete/linting, JSON validation |
| **graphql** | AST parsing and GraphQL schema validation |
| **graphql-ws** | WebSocket client for GraphQL subscriptions |
| **Recharts** | Charts and data visualization |
| **react-resizable-panels** | Resizable split pane layout |
| **react-virtuoso** | Virtualized list rendering for large responses |
| **lucide-react** | Icon library |
| **diff** | Text diff algorithm |

### Backend

| Technology | Purpose |
|-----------|---------|
| **Tauri v2** | Desktop application framework |
| **Rust** | Systems programming language |
| **reqwest** | HTTP client with HTTP/2, cookies, multipart, streaming |
| **tokio** | Async runtime |
| **rusqlite** | SQLite database bindings |
| **tonic** | gRPC client with TLS |
| **prost / prost-reflect** | Protocol Buffers serialization |
| **protox** | Protobuf file parser |
| **tokio-tungstenite** | WebSocket client |
| **axum** | High-performance catch-all HTTP server for mock routing |
| **rand_distr** | Normal distribution generation for latency emulation |
| **jsonpath-rust** | JSONPath request matching and faker resolution |
| **rquickjs** | JavaScript scripting engine (QuickJS) |
| **aes-gcm** | AES-256-GCM encryption for secrets |
| **serde_json** | JSON diff engine for ReplayLab response comparison |

### Storage & Security

| Technology | Purpose |
|-----------|---------|
| **SQLite** | Persistent storage for all data |
| **AES-256-GCM** | Encrypted secret variable storage |
| **SHA-256** | Key derivation for encryption |

---

## Data Persistence & Security

siReq stores all data **locally** in a SQLite database located in the application's data directory. No data leaves your machine unless you send a request.

**Stored data includes:**
- Request history
- Collections, folders, and saved requests
- Environments and their variables
- Global variables
- Cookies from responses
- Benchmark history
- Collection run history
- gRPC request history
- Request templates
- ReplayLab sessions, entries, runs, and results
- UI state (theme, sidebar, active tab, etc.)

**Security features:**
- Secret variables are encrypted at rest using **AES-256-GCM**
- Encryption keys are derived using SHA-256
- No telemetry, no analytics, no cloud sync
- All network requests originate from your machine to the target servers

---

## Project Structure

```
siReq/
├── src/                    # React frontend
│   ├── App.tsx             # Root component
│   ├── main.tsx            # Entry point
│   ├── components/         # UI components
│   │   ├── Request/        # Request builder (URL, headers, body, auth, scripts, schema, OAuth 2.0)
│   │   │   ├── OauthPanel.tsx # Enterprise OAuth 2.0 config & token HUD
│   │   │   └── ...
│   │   ├── Response/       # Response viewer (body, headers, cookies, diff, schema, variables)
│   │   ├── Sidebar/        # Sidebar (history, collections, environment)
│   │   ├── Intelligence/   # API Intelligence dashboard
│   │   ├── GrpcPanel.tsx / Grpc*.tsx  # gRPC client
│   │   ├── WebSocketPanel.tsx         # WebSocket client
│   │   ├── Flow/                      # Visual Chaining Flow Editor
│   │   │   ├── FlowPanel.tsx          # Main shell, toolbar, sidebar inspectors, & flow terminal
│   │   │   ├── FlowCanvas.tsx         # SVG/HTML grid canvas, pan/zoom, snapping, & wires drawer
│   │   │   └── FlowNode.tsx           # Visual render cards for all 8 node types (Start, Request, Condition, Timer, Logger, Set Variable, Script, Assertion)
│   │   ├── MockServer/                # Smart Mock Server components
│   │   │   ├── MockPanel.tsx          # 3-column mock server dashboard orchestrator
│   │   │   ├── MockConfigList.tsx     # Server instances listing, start/stop, duplicate, delete
│   │   │   ├── MockEndpointEditor.tsx # Endpoint path, method selector, and CORS settings
│   │   │   ├── MockScenarioEditor.tsx # Conditional response scenario details
│   │   │   ├── MockMatcherEditor.tsx  # Matching rules (headers, query, JSONPath)
│   │   │   ├── MockLatencyEditor.tsx  # Latency profiles configurator
│   │   │   ├── MockCorsEditor.tsx     # CORS headers controller
│   │   │   ├── MockLogViewer.tsx      # Real-time console logs and metrics dashboards
│   │   │   ├── MockLogDetail.tsx      # Log inspection details popup
│   │   │   ├── MockStatusBadge.tsx    # Glow status online/offline visual indicators
│   │   │   └── MockImportDialog.tsx   # OpenAPI JSON/YAML & collection mapper dialog
│   │   ├── RunnerPanel.tsx            # Collection runner
│   │   ├── Replay/                    # ReplayLab components
│   │   │   ├── ReplayPanel.tsx        # Main panel with 6 sub-tabs, streaming controls (pause/resume/cancel), HAR import
│   │   │   ├── ReplayTimeline.tsx     # Entry timeline list with drag-and-drop reordering
│   │   │   ├── ReplayWaterfall.tsx    # Chrome DevTools-style latency bars
│   │   │   ├── ReplayRuns.tsx         # Run history + 2-run comparison
│   │   │   ├── ReplayChaos.tsx        # Chaos config with probability sliders
│   │   │   ├── ReplayInspector.tsx    # Entry result inspector with full editing support
│   │   │   ├── ReplayDiffViewer.tsx   # JSON/text/header diff viewer
│   │   │   ├── ReplayEnvironmentMap.tsx # URL remapping
│   │   │   └── ReplayAssertions.tsx   # Session-level assertions
│   │   ├── ThemeProvider.tsx / ThemeToggle.tsx  # Theme system
│   │   └── ...                        # Other components
│   ├── stores/             # Zustand state stores
│   │   ├── mockStore.ts    # Smart Mock Server Zustand state store
│   │   ├── flowStore.ts    # Visual Flow Editor Zustand state store
│   │   ├── oauthStore.ts   # Enterprise OAuth 2.0 & OIDC Zustand store
│   │   └── ...
│   ├── lib/                # Utilities and Tauri invoke wrappers
│   ├── hooks/              # Custom React hooks
│   └── styles/             # Global CSS (Tailwind)
├── src-tauri/              # Rust backend
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs         # Desktop entry point
│   │   ├── lib.rs          # Tauri app setup (commands, plugins, state)
│   │   ├── commands/       # Tauri commands (HTTP, collections, env, mock server, etc.)
│   │   │   ├── mock_server.rs # Smart Mock Server commands
│   │   │   └── ...
│   │   ├── mock_server/    # Smart Mock Server module
│   │   │   ├── mod.rs      # Submodule exports
│   │   │   ├── models.rs   # Config, Scenarios, Rules, Log, and Stats structs
│   │   │   ├── storage.rs  # SQLite CRUD database functions
│   │   │   ├── latency.rs  # fixed, range, and normal distribution delay simulators
│   │   │   ├── faker.rs    # faker snippet resolvers & request variables echo mapping
│   │   │   ├── openapi.rs  # OpenAPI to mock server converter logic
│   │   │   ├── collection_import.rs # Existing Collection to mock server mapper
│   │   │   ├── router.rs   # axum catch-all route engine with preflights & matchers
│   │   │   └── manager.rs  # thread managers, concurrent limiters, and socket builders
│   │   ├── http.rs         # HTTP request execution
│   │   ├── grpc.rs         # gRPC client
│   │   ├── websocket.rs    # WebSocket client
│   │   ├── curl_parser.rs  # cURL command parser
│   │   ├── openapi_parser.rs  # OpenAPI spec parser
│   │   ├── postman_parser.rs  # Postman collection import/export
│   │   ├── scripts.rs      # JavaScript scripting engine
│   │   ├── variables.rs    # Variable resolution engine
│   │   ├── storage.rs      # SQLite database layer
│   │   ├── models.rs       # Shared data models
│   │   ├── secrets.rs      # AES-256-GCM encryption
│   │   └── api_intelligence.rs  # API analytics engine
│   │   ├── replay/             # ReplayLab module
│   │   │   ├── mod.rs          # Submodule exports
│   │   │   ├── models.rs       # ReplaySession, ReplayEntry, ReplayRun, ChaosConfig structs
│   │   │   ├── storage.rs      # SQLite CRUD for sessions, entries, runs, results
│   │   │   ├── har_parser.rs   # HAR JSON → Vec<HarEntry> parser
│   │   │   ├── diff_engine.rs  # JSON/text/header diff, schema drift, assertion evaluator
│   │   │   ├── engine.rs       # Replay execution, streaming, chaos injection, cancel/pause tokens, variable substitution
│   │   │   └── commands.rs     # 19 Tauri commands for ReplayLab (CRUD, reorder, edit, streaming, pause, resume, cancel)
│   └── Cargo.toml          # Rust dependencies
├── docs/
│   └── screenshots/        # README screenshots
└── package.json            # Frontend dependencies
```

## Testing

<p align="center">
  <img src="https://img.shields.io/github/actions/workflow/status/genc-murai/siReq/ci.yml?branch=main&logo=github&label=CI" alt="CI" />
  <img src="https://img.shields.io/github/actions/workflow/status/genc-murai/siReq/release.yml?branch=main&logo=githubactions&label=Release" alt="Release" />
  <img src="https://img.shields.io/badge/Frontend-341%20tests-3178C6?logo=vitest&logoColor=white" alt="Frontend: 341 tests" />
  <img src="https://img.shields.io/badge/Backend-217%20tests-000000?logo=rust&logoColor=white" alt="Backend: 217 tests" />
</p>

siReq includes unit test suites for both **Zustand state stores** (Vitest) and the **Rust backend** (cargo test).

### Running Tests

```bash
# Run all frontend tests
npx vitest run

# Run a specific test file
npx vitest run src/stores/flowStore.test.ts

# Run with coverage
npx vitest run --coverage

# Run all Rust backend tests
cd src-tauri && cargo test

# Run a specific Rust module
cargo test -- mock_server::manager
```

### Frontend Store Test Coverage

| Store | Tests | Coverage |
|-------|-------|----------|
| **sandbox** (`sandbox.test.ts`) | 120 | Script evaluation (sync/async), expression evaluation, error propagation (runtime/syntax/throw/thrown), scope isolation, `vars` read/write, function calls, `console.log`, timeout limits, `request`/`response` objects. Covers all sandboxed execution paths for pre-request, post-response, flow conditions, assertions, and scripting. |
| **flowStore** (`flowStore.test.ts`) | 44 | Node lifecycle (add/remove/connect/disconnect), P2 execution pipeline (Set Variable → Script → Assertion), undo/redo, clipboard copy/paste, flow validation, multi-node selection, runner launch, request snapshotting, keyboard shortcuts. |
| **runnerStore** (`runnerStore.test.ts`) | 46 | `runFlow()` — data-driven flow, single run, variable binding, stop-on-failure, iteration delay, error handling, stop mid-execution, edge cases (empty/null dataset, extracted variables, isRunning toggle). `startRun()` — collection run, data-driven collection, error handling (Error/string/null/undefined), `loadRunHistory` call on success & error, delay/stopOnFailure passthrough, fallback to `runCollection` when dataset is empty/null. |
| **requestStore** (`requestStore.test.ts`) | 41 | `send()` — invoke call chain, loading lifecycle, `lastResponse` preservation, error handling, environmentId passthrough. `cancel()` — invoke call, loading state. `runBenchmark()` — invoke chain, loading lifecycle, history refresh. `loadBenchmarkHistory()` — pagination, error handling. 15 setter tests, `reset()`, `deleteBenchmarkHistoryItem()`, `loadHistoricBenchmark()`. |
| **contractStore** (`contractStore.test.ts`) | 38 | `dereferenceSchema()` — 12 tests covering null/undefined input, deep clone, simple/nested/cyclic `$ref`, sibling attributes, escaped paths (`~1`), missing target, immutability, multi-level nesting. `getResponseSchemaFromSpec()` — 8 tests: valid hit, null/noPaths/missingPath/missingMethod/missingStatusCode, default fallback, text/plain content, case-insensitive method. `bindContract()` — stores config, calls `setJsonSchema` with dereferenced schema, array response, invalid/missing schema throws. `unbindContract()` — removal, clears jsonSchema, no side effects. Persistence — get/rebind lifecycle. |
| **websocketStore** (`websocketStore.test.ts`) | 25 | `setConnectionId()` — update, null clear. `setStatus()` — all 3 states. `setUrl()` — custom URL, empty string. `addMessage()` — sent/received/system directions, order preservation, unique IDs, binary flag, empty data, timestamp. `clearMessages()` — removal, no side effects. `reset()` — restores state, preserves URL. Lifecycle integration — full connect → message → disconnect cycle. |
| **graphqlRequest** (`graphqlRequest.test.ts`) | 15 | `buildGraphQLRequest()` — query/mutation with variables, operation name, headers, empty body, special characters. Error handling — invalid JSON variables, null/undefined inputs. |
| **graphqlStore** (`graphqlStore.test.ts`) | 8 | Schema introspection, SDL parsing, history management, endpoint configuration. |
| **uiStore** (`uiStore.test.ts`) | 4 | Theme toggle, sidebar state, panel layout persistence. |
| **Total** | **341** | 9 test files — all pass ✅ |

### Mock Architecture

For stores that call Tauri backend commands (`invoke`), tests use **`vi.hoisted()` + `vi.mock()`** to create mutable mock references:

```typescript
const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: {
    sendRequest: vi.fn(),
    cancelRequest: vi.fn(),
    benchmarkRequest: vi.fn(),
    getBenchmarkHistory: vi.fn(),
    deleteBenchmarkHistory: vi.fn(),
  },
}));

vi.mock("../lib/invoke", () => mockInvoke);
```

This pattern ensures:
- Mocks are reset between tests via `beforeEach`
- No actual Tauri backend calls are made during testing
- Call arguments and return values are fully assertable

Pure Zustand stores (e.g., `websocketStore`) require no mocking — state transitions are tested directly.

### Rust Backend Test Coverage

| Module | Tests | Coverage |
|--------|-------|----------|
| **scripts.rs** | 26 | `execute_pre_request` — empty script, modify URL/header, console.log, syntax error, set/read variables. `execute_post_response` — passing/failing tests, expect_include, toHaveLength, console.log, set_variable, JSON parsing. `execute_extractions` — simple/nested/array/bracket JSONPath, disabled extraction, non-JSON body, missing path, multiple extractions, direct JS exec. |
| **variables.rs** | 29 | Variable resolution engine — `{{placeholder}}` replacement, dynamic helpers (`$timestamp`, `$uuid`, `$randomInt`, `$randomString`, `$randomEmail`, `$guid`), nested resolution, escape sequences, error handling. |
| **mock_server/faker.rs** | 33 | `faker.*` (uuid/name/email/date/integer/number), `request.*` (path/query/header/body/variable), case-insensitive header, unknown/warning/bad-args, iteration limit. Request variable echo from query/header/body. |
| **mock_server/manager.rs** | 24 | `new()` / `Default`, `stop_server` (nonexistent/running/isolation), `stop_all` (empty/populated), `get_server_status` (stopped/running/transition), `update_server_config` (no-op/port-change rejection/config update), `get_server_logs` (error/empty/stored entries), `get_server_stats` (error/defaults/updated), log isolation, concurrent limits. |
| **mock_server/router.rs** | 22 | `match_path` — exact, colon param, brace param, mixed params, root, trailing slashes, different lengths. `evaluate_rule` — query/header/body/jsonpath matching, exists/equals/contains/regex operators, case-insensitive headers, unknown source/operator. |
| **mock_server/collection_import.rs** | 19 | `extract_path` URL parsing (full URL, variable prefix, query string, edge cases). `collection_to_mock_config` — basic structure, example scenarios, empty collection, nested folder, error handling. |
| **grpc** (`grpc.rs`) | 23 | gRPC client — method descriptor parsing, streaming types, TLS config, proto reflection, error handling. |
| **http.rs** | 13 | `extract_domain` (4), `format_cookie_header` (2), `parse_set_cookie` (6), `cancel_request` (1). |
| **websocket.rs** | 10 | WebSocket client — connect/disconnect, send/receive, event handling, error recovery, environment variable resolution in URL. |
| **mock_server/latency.rs** | 10 | None, fixed, random range, normal distribution, clamp 30s, unknown mode, edge cases. |
| **mock_server/openapi.rs** | 8 | `openapi_to_mock_config` — paths, metadata, fallback endpoints, default, v2/v3 support. |
| **http.rs (integration)** | 9 | End-to-end HTTP request/response lifecycle — method passthrough, headers, body, query params, redirects, errors. |
| **Total** | **217** | All modules — 0 failed, 0 ignored ✅ |

### Grand Total

| Suite | Tests |
|-------|-------|
| Frontend (Vitest) | **341** |
| Rust backend (`cargo test`) | **217** |
| **Grand total** | **558** |

---

## Contributing

Contributions are welcome! Here's how you can help:

- **Report bugs** — Open an issue with detailed reproduction steps
- **Suggest features** — Open an issue with your idea
- **Submit pull requests** — Fork the repo, make changes, and submit a PR

**Development setup:**

```bash
git clone <repository-url>
cd siReq
npm install
npx tauri dev
```

---

## License

This project is currently not licensed. All rights reserved.

---

<p align="center">
  <strong>Built with ❤️ using Tauri v2 · Rust · React · TypeScript</strong>
</p>
