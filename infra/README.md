# AWS CDK infrastructure

This folder defines the **AWS CDK** stack for the typing speed application. The stack provisions a full environment: Cognito, DynamoDB, Lambda API, HTTP API, S3 bucket, and CloudFront distribution.

For **architecture diagrams** and component overview, see **[../docs/aws-architecture.md](../docs/aws-architecture.md)**.

## Stack

| Stack name | Purpose |
|------------|---------|
| `typing-speed-dev` | Single environment |

## What the stack creates

- **Amazon Cognito** User Pool and app client (no client secret; SRP + `USER_PASSWORD` for the SPA)
- **DynamoDB** table `typing-speed-dev-app` (`pk` + `sk`, on-demand billing)
- **AWS Lambda** (`typing-speed-dev-api`) — Node.js handler in `lambda/api/` (REST-style routes for users, scores, analytics, health, and optional Bedrock-backed AI routes)
- **API Gateway** HTTP API with CORS for browser access
- **S3** bucket (private) + **CloudFront** distribution (SPA: 403/404 return `index.html`)

## Prerequisites

- Node.js 18+
- AWS CLI configured (`aws configure` or environment variables)
- **CDK bootstrap** once per account/region:

```bash
npx cdk bootstrap aws://ACCOUNT_ID/REGION
```

Example:

```bash
npx cdk bootstrap aws://123456789012/eu-central-1
```

## Commands

```bash
cd infra
npm install

# Preview CloudFormation
npx cdk synth typing-speed-dev

# Deploy
npm run deploy:dev

# Tear down
npm run destroy:dev
```

Set the account/region if not using CLI defaults:

```bash
export CDK_DEFAULT_REGION=eu-central-1
export CDK_DEFAULT_ACCOUNT=123456789012
```

## After deploy

1. Note **Outputs** in the terminal (or CloudFormation → stack → Outputs):

   - `HttpApiUrl` — base URL for the API
   - `CloudFrontUrl` — URL for the SPA after upload
   - `UserPoolId`, `UserPoolClientId`, `CognitoIssuer`, `AwsRegion` — for the React app

2. **Upload the production build** to the site bucket:

   ```bash
   cd ..
   npm run build
   aws s3 sync build/ s3://BUCKET_FROM_OUTPUT --delete
   ```

3. **Invalidate CloudFront** after updates:

   ```bash
   aws cloudfront create-invalidation --distribution-id DISTRIBUTION_ID --paths "/*"
   ```

## App environment variables (build time)

Point the React app at the deployed API and Cognito (use values from stack Outputs):

```bash
VITE_API_URL=https://xxxxxxxx.execute-api.eu-central-1.amazonaws.com
VITE_COGNITO_USER_POOL_ID=eu-central-1_xxxx
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_AWS_REGION=eu-central-1
```

## Bedrock (AI features)

If you use AI coaching or AI practice passages, enable **model access** for the chosen model in the **Amazon Bedrock** console for the same account and region. The Lambda role includes `bedrock:InvokeModel`. Optional: set **`BEDROCK_MODEL_ID`** on the function to override the default inference profile resolution (see [../docs/ai-features.md](../docs/ai-features.md)).

## Costs and cleanup

The stack uses `RemovalPolicy.DESTROY` on data stores so **`cdk destroy`** can remove them (S3 uses `autoDeleteObjects`). Destroying the stack removes the Cognito user pool and DynamoDB data.
