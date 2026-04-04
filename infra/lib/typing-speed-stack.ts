import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwIntegrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export interface TypingSpeedStackProps extends StackProps {
  /** Logical environment name — used in resource names and tags. */
  envName: "dev" | "prod";
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
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: envName === "prod",
      },
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
    });

    // --- API Lambda (placeholder handler; extend for /api/users, /api/scores) ---
    const apiLambdaPath = path.join(__dirname, "..", "lambda", "api");

    const apiLogGroup = new logs.LogGroup(this, "ApiLogGroup", {
      retention:
        envName === "prod" ? logs.RetentionDays.TWO_WEEKS : logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const apiFunction = new lambda.Function(this, "ApiFunction", {
      functionName: `${prefix}-api`,
      description: `Typing speed REST API (${envName})`,
      runtime: lambda.Runtime.NODEJS_20_X,
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
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminDeleteUser",
        ],
        resources: [this.userPool.userPoolArn],
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

    // --- Outputs for frontend / CI ---
    const region = Stack.of(this).region;
    const issuer = `https://cognito-idp.${region}.amazonaws.com/${this.userPool.userPoolId}`;

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
      description: "Upload CRA build: aws s3 sync build/ s3://BUCKET --delete",
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
