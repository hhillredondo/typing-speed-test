import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwIntegrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { GitHubActionsRole } from "./github-actions-role";

export interface TypingSpeedStackProps extends StackProps {
  /** Logical environment name — used in resource names and tags. */
  envName: "dev";
}

export class TypingSpeedStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly table: dynamodb.Table;
  public readonly httpApi: apigwv2.HttpApi;
  public readonly siteBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: TypingSpeedStackProps) {
    super(scope, id, props);

    const { envName } = props;
    const prefix = `typing-speed-${envName}`;

    cdk.Tags.of(this).add("Project", "typing-speed");
    cdk.Tags.of(this).add("Environment", envName);

    // --- DynamoDB (single-table style: pk + sk) ---
    this.table = new dynamodb.Table(this, "AppTable", {
      tableName: `${prefix}-app`,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      timeToLiveAttribute: "ttl",
    });

    this.table.addGlobalSecondaryIndex({
      indexName: "gsi1",
      partitionKey: { name: "gsi1pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "gsi1sk", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // --- Cognito (SPA: no client secret) ---
    this.userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `${prefix}-users`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: false,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.userPoolClient = this.userPool.addClient("WebClient", {
      userPoolClientName: `${prefix}-web`,
      generateSecret: false,
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
      preventUserExistenceErrors: true,
      // Already the default for new clients; stated because logout depends on it.
      enableTokenRevocation: true,
    });

    // --- API Lambda ---
    // Points at the esbuild output, not the source dir: the handler depends on
    // aws-jwt-verify, so the function must ship its bundled dependencies.
    // Build with `npm ci && npm run build` in lambda/api before `cdk deploy`.
    const apiLambdaPath = path.join(__dirname, "..", "lambda", "api", "dist");

    const apiLogGroup = new logs.LogGroup(this, "ApiLogGroup", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const apiFunction = new lambda.Function(this, "ApiFunction", {
      functionName: `${prefix}-api`,
      description: `Typing speed REST API (${envName})`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(apiLambdaPath),
      timeout: Duration.seconds(29),
      memorySize: 256,
      logGroup: apiLogGroup,
      environment: {
        TABLE_NAME: this.table.tableName,
        ENV_NAME: envName,
        COGNITO_USER_POOL_ID: this.userPool.userPoolId,
        COGNITO_CLIENT_ID: this.userPoolClient.userPoolClientId,
        // ALLOWED_ORIGIN is set below, once the distribution domain is known.
        // Optional: set to override inference profile (default is chosen from AWS_REGION in Lambda).
        // BEDROCK_MODEL_ID: "eu.amazon.nova-micro-v1:0",
      },
    });

    this.table.grantReadWriteData(apiFunction);

    apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "cognito-idp:SignUp",
          "cognito-idp:ConfirmSignUp",
          "cognito-idp:ResendConfirmationCode",
          "cognito-idp:InitiateAuth",
          // Lets logout end the session server-side instead of leaving the
          // refresh token usable for its full validity period.
          "cognito-idp:RevokeToken",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminDeleteUser",
        ],
        resources: [this.userPool.userPoolArn],
      })
    );

    apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      })
    );

    const lambdaIntegration = new apigwIntegrations.HttpLambdaIntegration(
      "ApiIntegration",
      apiFunction
    );

    // --- HTTP API ---
    this.httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: `${prefix}-http-api`,
      description: `Typing speed HTTP API (${envName})`,
      corsPreflight: {
        allowHeaders: ["Content-Type", "Authorization"],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ["*"],
        maxAge: Duration.days(1),
      },
    });

    this.httpApi.addRoutes({
      path: "/",
      methods: [apigwv2.HttpMethod.ANY],
      integration: lambdaIntegration,
    });
    this.httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [apigwv2.HttpMethod.ANY],
      integration: lambdaIntegration,
    });

    // --- Static site: private S3 + CloudFront OAI ---
    this.siteBucket = new s3.Bucket(this, "SiteBucket", {
      // Omit physical name: tokens in names fail CDK validation; name is auto-generated and unique.
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
    });

    this.distribution = new cloudfront.Distribution(this, "SiteDistribution", {
      comment: `${prefix} SPA`,
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessIdentity(this.siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.minutes(5),
        },
      ],
    });

    // --- GitHub Actions deploy role (OIDC) ---
    new GitHubActionsRole(this, "GitHubActionsDeployRole", {
      repo: "AlphaAnimal/typing-speed-test",
      siteBucket: this.siteBucket,
      distribution: this.distribution,
    });

    // --- Bedrock spend alert ---
    new budgets.CfnBudget(this, "BedrockBudget", {
      budget: {
        budgetName: `${prefix}-bedrock-monthly`,
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: 5, unit: "USD" },
        costFilters: { Service: ["Amazon Bedrock"] },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold: 100,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [
            { subscriptionType: "EMAIL", address: "h.h.redondo@gmail.com" },
          ],
        },
      ],
    });

    // --- Outputs for frontend / CI ---
    const region = Stack.of(this).region;
    const issuer = `https://cognito-idp.${region}.amazonaws.com/${this.userPool.userPoolId}`;

    // Pin the API's CORS origin to the site itself. Done after the distribution is
    // constructed because the domain is only known then; there is no cycle, as the
    // distribution does not depend on the function.
    apiFunction.addEnvironment(
      "ALLOWED_ORIGIN",
      `https://${this.distribution.distributionDomainName}`
    );

    new CfnOutput(this, "HttpApiUrl", {
      value: this.httpApi.apiEndpoint,
      description: "Base URL for REST API (append paths like /api/scores)",
      exportName: `${prefix}-api-url`,
    });

    new CfnOutput(this, "UserPoolId", {
      value: this.userPool.userPoolId,
      exportName: `${prefix}-user-pool-id`,
    });

    new CfnOutput(this, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
      exportName: `${prefix}-user-pool-client-id`,
    });

    new CfnOutput(this, "CognitoIssuer", {
      value: issuer,
      description: "JWT issuer for API Gateway authorizer / libraries",
      exportName: `${prefix}-cognito-issuer`,
    });

    new CfnOutput(this, "AwsRegion", {
      value: region,
      exportName: `${prefix}-aws-region`,
    });

    new CfnOutput(this, "AppTableName", {
      value: this.table.tableName,
      exportName: `${prefix}-ddb-table`,
    });

    new CfnOutput(this, "SiteBucketName", {
      value: this.siteBucket.bucketName,
      description: "Upload the Vite build: aws s3 sync build/ s3://BUCKET --delete",
      exportName: `${prefix}-site-bucket`,
    });

    new CfnOutput(this, "CloudFrontUrl", {
      value: `https://${this.distribution.distributionDomainName}`,
      description: "SPA URL after you upload index.html to the bucket",
      exportName: `${prefix}-cloudfront-url`,
    });

    new CfnOutput(this, "DistributionId", {
      value: this.distribution.distributionId,
      description: "Use for cache invalidation after deploys",
      exportName: `${prefix}-distribution-id`,
    });
  }
}
