# Number9 System D

A custom Angular & Tailwind CSS dashboard system built for modern web applications.

## Overview

Number9 System D is a comprehensive dashboard application built with Angular 21 and Tailwind CSS 4. It provides a solid foundation for building responsive, feature-rich web applications with a focus on developer experience and code quality.

## Features

- ✅ Modern Angular 21 with Signals
- ✅ Tailwind CSS 4 with custom theming
- ✅ Dark/Light theme support
- ✅ Responsive layout system
- ✅ Authentication module
- ✅ Dashboard with data visualization
- ✅ Modular architecture
- ✅ TypeScript strict mode
- ✅ E2E testing with Playwright

## Tech Stack

| Technology | Version |
|---|---|
| Angular | 21.0.6 |
| Tailwind CSS | 4.1.18 |
| TypeScript | 5.9.3 |
| Node.js | 18+ |

## Getting Started

### Prerequisites
- Node.js 18 or higher
- npm or yarn

### Installation

```bash
npm install
```

### Development Server

```bash
npm start
```

The app will be available at `http://localhost:4200`

## Available Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start dev server with live reload |
| `npm run build` | Build for production |
| `npm run watch` | Build in watch mode |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run E2E tests with UI |
| `npm run lint` | Run ESLint |
| `npm run prettier` | Format code with Prettier |

## Project Structure

```
src/
├── app/
│   ├── core/              # Core services, guards, models
│   ├── modules/           # Feature modules (auth, dashboard, etc)
│   ├── shared/            # Shared components & utilities
│   └── app.component.*    # Root component
├── assets/                # Static assets
├── environments/          # Environment configs
└── styles/               # Global styles
```

## Modules

- **Auth**: User authentication and login
- **Dashboard**: Main dashboard with visualizations
- **Layout**: Sidebar, navbar, footer components
- **UIKit**: Reusable UI components

## Development

### Code Style
- ESLint for linting
- Prettier for code formatting
- Tailwind CSS class ordering via Prettier plugin

### Testing
- Unit tests with Jasmine/Karma
- E2E tests with Playwright

## License

MIT

---

**Built with ❤️ by Number9 Development Team**
