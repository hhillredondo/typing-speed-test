# Typing speed test

A browser-based typing speed test with a global leaderboard, personal analytics, and optional AI-powered coaching. The frontend is a React (Create React App) application; the backend is a serverless API on AWS.

## Features

- **Typing test** — Timed word test with accuracy and WPM-style scoring.
- **Accounts** — Sign up and sign in via Amazon Cognito (email verification).
- **Leaderboard** — Global scores stored in DynamoDB and queried through the API.
- **Analytics** — Per-key and bigram statistics, pacing windows, trends, fatigue-style labels, backspace metrics, and a keyboard heatmap (logged-in users, data from completed tests).
- **Weakness Drill** — Short practice sessions targeting weak keys and bigrams from word lists, plus optional **AI-generated practice passages** (Amazon Bedrock).
- **AI Coach** — Short personalized summaries on the Analytics page (Bedrock), with server-side caching to limit cost.

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/README.md](docs/README.md) | Index of all documentation |
| [docs/aws-architecture.md](docs/aws-architecture.md) | AWS components and diagrams |
| [docs/analytics.md](docs/analytics.md) | How typing statistics are computed and stored |
| [docs/ai-features.md](docs/ai-features.md) | AI coaching and AI practice passages |
| [infra/README.md](infra/README.md) | CDK deploy commands and build-time environment variables |

## Local development

Requirements: **Node.js** (LTS recommended), **npm**.

```bash
npm install
npm start
```

Opens the app at [http://localhost:3000](http://localhost:3000). For API calls (login, scores, analytics), configure the React app to point at a deployed backend (see environment variables below).

### Environment variables (frontend)

Copy [`.env.example`](.env.example) to **`.env.local`** (ignored by git) and fill in values, or set:

| Variable | Description |
|----------|-------------|
| `REACT_APP_API_URL` | Base URL of the HTTP API (no trailing slash required by all clients; match your deployment) |
| `REACT_APP_COGNITO_USER_POOL_ID` | Cognito User Pool ID |
| `REACT_APP_COGNITO_CLIENT_ID` | Cognito app client ID |
| `REACT_APP_AWS_REGION` | AWS region (e.g. `eu-central-1`) |

After changing `.env.local`, restart the dev server.

### Build

```bash
npm run build
```

Outputs a production bundle under `build/`, which you upload to the S3 bucket behind CloudFront (see `infra/README.md`).

### Tests

```bash
npm test
```

## Tech stack

- **UI:** React, TypeScript, Material UI
- **API:** AWS Lambda (Node.js), API Gateway HTTP API
- **Data:** DynamoDB (single-table design)
- **Auth:** Amazon Cognito
- **Hosting:** S3 + CloudFront
- **AI (optional):** Amazon Bedrock (Nova Micro via regional inference profiles)

## License

Specify your license in a `LICENSE` file at the repository root. This README does not impose a license by default.
