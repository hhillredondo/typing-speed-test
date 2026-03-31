# Typing speed — AWS CDK infrastructure

Defines **two stacks** in one AWS account:

| Stack               | Purpose     |
| ------------------- | ----------- |
| `typing-speed-dev`  | Development |
| `typing-speed-prod` | Production  |

Each stack provisions:

- **Cognito User Pool** + app client (no client secret; SRP + USER_PASSWORD for SPA)
- **DynamoDB** table `typing-speed-<env>-app` (`pk` + `sk`, on-demand billing)
- **Lambda** (`typing-speed-<env>-api`) + **HTTP API** (API Gateway v2) with CORS `*`
- **S3** bucket (private) + **CloudFront** distribution (SPA: 403/404 → `index.html`)

The Lambda handler under `lambda/api/` is a **placeholder**. Implement `/api/users`, `/api/scores`, etc. next.

## Prerequisites

- Node.js 18+
- AWS CLI configured (`aws configure` or environment variables)
- **CDK bootstrap** once per account/region:

```bash
npx cdk bootstrap aws://ACCOUNT_ID/REGION
# Example:
npx cdk bootstrap aws://123456789012/eu-west-1
```

## Commands

```bash
cd infra
npm install

# Preview CloudFormation
npx cdk synth typing-speed-dev

# Deploy (pick one stack at a time)
npm run deploy:dev
npm run deploy:prod

# Tear down
npm run destroy:dev
npm run destroy:prod
```

Set the region (if not using the CLI default):

```bash
export CDK_DEFAULT_REGION=eu-west-1
export CDK_DEFAULT_ACCOUNT=123456789012
```

## After deploy

1. Note **Outputs** in the terminal (or CloudFormation → stack → Outputs):

   - `HttpApiUrl` — base URL for the API
   - `CloudFrontUrl` — URL for the SPA (after upload)
   - `UserPoolId`, `UserPoolClientId`, `CognitoIssuer`, `AwsRegion` — for Cognito in the React app

2. **Upload the CRA build** to the `SiteBucketName` bucket:

   ```bash
   cd ..
   npm run build
   aws s3 sync build/ s3://BUCKET_FROM_OUTPUT --delete
   ```

3. **Invalidate CloudFront** (optional, after updates):

   ```bash
   aws cloudfront create-invalidation --distribution-id DISTRIBUTION_ID --paths "/*"
   ```

## Frontend environment variables

Point the React app at the deployed API and Cognito (example names—match your Outputs):

```bash
REACT_APP_API_URL=https://xxxxxxxx.execute-api.eu-west-1.amazonaws.com
REACT_APP_COGNITO_USER_POOL_ID=eu-west-1_xxxx
REACT_APP_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
REACT_APP_AWS_REGION=eu-west-1
```

## Costs & cleanup

Stacks use `RemovalPolicy.DESTROY` on data stores so **`cdk destroy`** can remove them (S3 uses `autoDeleteObjects`). **Prod** still has **DynamoDB point-in-time recovery** enabled when `envName === "prod"` (extra cost).
