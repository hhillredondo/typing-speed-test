# Typing speed test

A typing test that keeps track of how you are actually doing. You type a passage
against the clock and it records the usual words-per-minute and accuracy, but it
also keeps per-key and per-bigram timings, so it can tell you which keys are
slowing you down and generate drills aimed at them. Signed-in users get a
leaderboard, charts over time, and a short written summary of their weak spots.

The frontend is React and Vite. The backend is a Lambda behind API Gateway, with
DynamoDB for storage, Cognito for accounts, and Bedrock for the written
summaries.

## Running it locally

You need Node 20 or newer.

```bash
npm install
npm run dev
```

The app comes up on http://localhost:3000. The typing test itself runs entirely
in the browser, so it works with no further setup.

Accounts, the leaderboard and the saved analytics all talk to the API, so those
need a backend to point at. Copy the example env file and fill in the values from
a deployed stack:

```bash
cp .env.example .env.local
```

```
VITE_API_URL=https://your-api-id.execute-api.eu-central-1.amazonaws.com
VITE_COGNITO_USER_POOL_ID=eu-central-1_xxxxxxxxx
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_AWS_REGION=eu-central-1
```

Only variables starting with `VITE_` reach the browser bundle, which is Vite's
way of making sure nothing else in your environment leaks into the build.
Restart the dev server after editing the file.

## Tests

```bash
npm run test:ci
```
