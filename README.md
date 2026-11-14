# RailConnect

**AI-Powered Smart Railway Management Platform**

RailConnect is a railway management platform designed to bring train information, passenger services, operational insights, and railway staff workflows into one application. It combines a Next.js web client with a Node.js API and machine-learning-based ETA prediction services.

> **Project status:** This repository contains an actively developed project. Some tracking experiences, especially geographic map accuracy and live journey-state synchronization, may still need refinement. Live data availability can also depend on the configured provider and simulator fallback.

## Key Features

- **Train discovery and information** — search trains and view route and journey information.
- **Train tracking dashboard** — view train status, delay, speed, current/next station information, journey progress, and upcoming stops where data is available.
- **Predictive ETA** — machine-learning inference for estimated train arrival times.
- **Weather-aware delay insights** — incorporate weather information into delay analysis where supported by the configured service.
- **GIS-based visualization** — visualize railway journeys and station information.
- **AI railway assistant** — provide railway-focused assistance within the application.
- **Role-based workspaces** — separate experiences for passengers, administrators, and Train Ticket Examiners (TTEs).
- **Ticketing and passenger account features** — booking workflows, wallet/payment-related UI, and account functionality.
- **Operational insights** — dashboards and historical analytics to support railway operations.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS |
| UI and interaction | Radix UI, Framer Motion, Lucide |
| Charts | Chart.js, react-chartjs-2 |
| API communication | Axios |
| Realtime client communication | Socket.IO client |
| Backend | Node.js API |
| Machine learning | ETA prediction and weather-aware inference services |

## Project Structure

```text
RailConnect/
├── client/          # Next.js frontend
├── server/          # Backend API and server-side functionality
├── README.md
└── ...
```

The repository may contain additional service, model, test, and data directories. Their exact contents depend on the checked-in project version.

## Getting Started

### Prerequisites

Install the following before running the project:

- Node.js and npm
- Git
- Any additional runtime required by the machine-learning service used in your setup

### 1. Clone the repository

```bash
git clone https://github.com/chirag-rish/RAILCONNECT.git
cd RAILCONNECT
```

### 2. Configure the frontend

Create a local environment file inside `client` by copying the example:

**Windows PowerShell**
```powershell
Copy-Item client/.env.local.example client/.env.local
```

Open `client/.env.local` and set the API URL to the port used by your backend. For the local setup currently used during development:

```env
NEXT_PUBLIC_API_URL=http://localhost:5002
```

Do not commit `.env.local` or any file containing real credentials, tokens, or API keys. Keep secrets in local environment files and deployment environment settings.

### 3. Install frontend dependencies

```powershell
cd client
npm install
```

### 4. Start the frontend

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Start the backend and ML service

The frontend expects the backend API to be available at the URL configured in `NEXT_PUBLIC_API_URL`. The local development API health endpoint has been tested at:

```text
http://localhost:5002/health
```

Start the backend and any required ML inference service using the scripts and setup instructions provided in their respective service directories. The exact backend and ML startup commands should be confirmed from those service manifests before being documented here.

## Available Frontend Scripts

Run these commands from the `client` directory:

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Create a production build |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |

## Configuration and Security

- Use the example environment files as templates.
- Never publish `.env`, `.env.local`, access tokens, passwords, database credentials, or private API keys.
- Configure the API URL and provider credentials for your own environment.
- Live train data depends on the availability and configuration of the selected data provider. A simulator fallback may be used when live provider data is unavailable.
- Do not treat simulated train positions or predictions as official railway information.

## Development Notes

- The frontend production build and ESLint checks have been run successfully in the development environment.
- TypeScript validation has also been run successfully after fixing a settings-page type issue.
- The train map and journey timeline are areas for continued refinement; verify their data synchronization and geographic accuracy before presenting them as fully live GPS tracking.

## Future Improvements

- Improve geographic accuracy and usability of the live train map.
- Keep the train marker, journey timeline, next-stop calculation, ETA, and operational analysis synchronized to a single train-position state.
- Expand automated tests for booking, tracking, role-based access, and prediction workflows.
- Add deployment instructions and screenshots for each user role.

## Contribution

Contributions, bug reports, and suggestions are welcome. For significant changes, create a feature branch and submit a pull request with a clear description of the change.

## Disclaimer

RailConnect is an independent software project and is not an official Indian Railways application. Train information, ETA predictions, and operational insights are provided for demonstration and development purposes unless independently verified against an authoritative source.
