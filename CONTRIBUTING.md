# Contributing to siReq

First off, thank you for considering contributing to siReq! We welcome contributions of all kinds — bug reports, feature suggestions, documentation improvements, and code changes.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)
- [Feature Requests](#feature-requests)

## Code of Conduct

This project is committed to providing a welcoming, inclusive environment for everyone. By participating, you agree to:

- Be respectful and considerate
- Accept constructive criticism gracefully
- Focus on what's best for the community
- Show empathy towards others

## Getting Started

### Prerequisites

- **Node.js** 20+ ([install](https://nodejs.org/))
- **Rust** stable toolchain ([install via rustup](https://rustup.rs/))
- **Tauri v2 system prerequisites** — See the [official Tauri guide](https://v2.tauri.app/start/prerequisites/) for your platform

### Clone & Install

```bash
git clone https://github.com/genc-murat/siReq.git
cd siReq
npm install
```

## Development Setup

### Running in Development Mode

```bash
npx tauri dev
```

This launches the desktop application with hot-reload for both the Rust backend and the React frontend.

### Frontend-Only Development

```bash
npm run dev
```

Starts only the Vite dev server. Useful for UI-only work. Note that Tauri commands (invoke) will not be available.

### Building for Production

```bash
npm run build        # Build the frontend
npx tauri build      # Build the desktop app installer
```

## Project Structure

```
siReq/
├── src/                    # React frontend (TypeScript + TSX)
│   ├── App.tsx             # Root component
│   ├── main.tsx            # Entry point
│   ├── components/         # UI components
│   │   ├── Request/        # Request builder
│   │   ├── Response/       # Response viewer
│   │   ├── Sidebar/        # Sidebar (history, collections, env)
│   │   ├── Flow/           # Visual Chaining Flow Editor
│   │   ├── MockServer/     # Smart Mock Server
│   │   ├── Replay/         # ReplayLab
│   │   ├── Intelligence/   # API Intelligence dashboard
│   │   ├── GraphQL/        # GraphQL client
│   │   └── ...             # Other shared components
│   ├── stores/             # Zustand state stores
│   ├── lib/                # Utilities and Tauri invoke wrappers
│   │   └── invoke/         # Tauri command wrappers
│   ├── hooks/              # Custom React hooks
│   └── styles/             # Global CSS (Tailwind)
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs         # Desktop entry point
│   │   ├── lib.rs          # Tauri app setup (commands, plugins, state)
│   │   ├── commands/       # Tauri IPC commands
│   │   ├── mock_server/    # Mock server module
│   │   ├── replay/         # ReplayLab module
│   │   └── ...             # HTTP, gRPC, WebSocket, etc.
│   └── Cargo.toml          # Rust dependencies
├── docs/                   # Landing page & screenshots
├── scripts/                # Build/utility scripts
└── package.json            # Frontend dependencies
```

## Coding Standards

### TypeScript / React

- **TypeScript strict mode** is enabled — avoid using `any` types. Use proper types, interfaces, or generics.
- **Functional components** with hooks — no class components.
- **Zustand** for state management — stores should be in `src/stores/`.
- **Radix UI** for accessible primitives — prefer Radix over custom-built dialogs, selects, etc.
- **Tailwind CSS v4** for styling — avoid inline styles and CSS modules.
- Use `crypto.randomUUID()` for generating unique IDs.
- Import path aliases: use `@/` (e.g., `@/components/Layout`, `@/lib/invoke`).

### Rust

- Follow standard Rust idioms and the [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/).
- Run `cargo clippy` before committing — clippy warnings are treated as errors in CI.
- Use `cargo fmt` for consistent formatting.
- Prefer `anyhow::Result` for error propagation in command handlers.

### Git Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: correct bug in module
refactor: restructure code without behavior change
test: add or update tests
docs: update documentation
chore: build/config changes
style: formatting, imports, no logic change
```

Commit messages should be clear and descriptive. Example:

```
feat(http): add support for multipart form data upload
fix(grpc): handle TLS certificate verification errors
test(flow): add integration tests for set_variable node
```

## Testing

We aim for high test coverage across both frontend and backend.

### Frontend Tests (Vitest)

```bash
# Run all frontend tests
npx vitest run

# Run tests for a specific store
npx vitest run src/stores/flowStore.test.ts

# Run with coverage
npx vitest run --coverage
```

**Test Patterns:**
- **Zustand stores**: Use `vi.hoisted()` + `vi.mock()` for mocking Tauri invoke calls. Reset store state in `beforeEach`.
- **Pure utilities**: Test directly with standard Vitest assertions.
- **Property-based testing**: Use `fast-check` (fc) for testing undo/redo, state invariants, etc.

### Rust Backend Tests

```bash
# Run all Rust tests
cd src-tauri && cargo test

# Run tests for a specific module
cargo test -- mock_server::manager
```

### Pre-Push Checklist

Before submitting a PR, ensure:

1. `npx tsc --noEmit` — TypeScript typecheck passes
2. `npm run lint` — ESLint reports 0 errors
3. `npx vitest run` — All frontend tests pass
4. `cargo check --manifest-path src-tauri/Cargo.toml` — Rust compiles
5. `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` — No clippy warnings
6. `cargo test --manifest-path src-tauri/Cargo.toml` — All Rust tests pass

## Pull Request Process

1. **Fork the repository** and create a feature branch from `main`.
2. **Make your changes** following the coding standards above.
3. **Run the pre-push checklist** to verify everything passes.
4. **Write or update tests** as needed. New features should include tests.
5. **Update documentation** if your changes affect public APIs or user-facing behavior.
6. **Create a pull request** against the `main` branch with a clear description:
   - What change does this PR introduce?
   - Why is this change needed?
   - How was it tested?
   - Screenshots for UI changes (if applicable)

### PR Review Process

- At least one maintainer review is required before merging.
- Address review feedback promptly.
- Keep PRs focused — one feature/fix per PR.
- Large changes should be discussed in an issue first.

## Issue Reporting

### Bug Reports

When reporting a bug, please include:

- **Description**: Clear, concise description of the bug
- **Steps to reproduce**: Minimal, complete steps to trigger the bug
- **Expected behavior**: What you expected to happen
- **Actual behavior**: What actually happened
- **Screenshots**: If applicable
- **Environment**: OS version, siReq version, relevant configuration

### Labels

- `bug` — Something isn't working
- `enhancement` — New feature or improvement
- `documentation` — Docs need updating
- `good first issue` — Great for newcomers
- `help wanted` — Maintainers want help on this

## Feature Requests

We welcome feature suggestions! When proposing a feature:

1. **Check existing issues** to avoid duplicates
2. **Describe the problem** you're trying to solve
3. **Propose a solution** with enough detail to understand the scope
4. **Consider alternatives** you've thought about

## Additional Resources

- [Tauri v2 Documentation](https://v2.tauri.app/)
- [React 19 Documentation](https://react.dev/)
- [Zustand Documentation](https://github.com/pmndrs/zustand)
- [Tailwind CSS v4 Documentation](https://tailwindcss.com/)
- [Radix UI Documentation](https://www.radix-ui.com/)

---

Thank you for contributing to siReq! 🚀
