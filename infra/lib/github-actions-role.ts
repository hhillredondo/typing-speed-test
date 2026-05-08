import { CfnOutput, Stack } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export interface GitHubActionsRoleProps {
  /** GitHub repo slug, e.g. "AlphaAnimal/typing-speed-test". */
  repo: string;
  /** Site bucket the deploy job needs to sync `build/` into. */
  siteBucket: s3.Bucket;
  /** CloudFront distribution to invalidate after a deploy. */
  distribution: cloudfront.Distribution;
}

/**
 * Creates (or imports) the GitHub OIDC provider and an IAM role that
 * GitHub Actions can assume to deploy this stack and publish to S3 / CloudFront.
 *
 * Trust is scoped to pushes on `refs/heads/main` of the given repo.
 * The role only has permission to assume the four CDK bootstrap roles
 * (so deploys go through CDK's own IAM, not via a god-role).
 */
export class GitHubActionsRole extends Construct {
  public readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: GitHubActionsRoleProps) {
    super(scope, id);

    const { account } = Stack.of(this);

    // The GitHub OIDC provider is an account-wide singleton. We import the
    // existing one rather than creating it, so this stack stays compatible
    // with accounts that already use GitHub Actions for other repos.
    const oidcProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      "GitHubOidcProvider",
      `arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com`
    );

    this.role = new iam.Role(this, "Role", {
      roleName: "typing-speed-dev-github-actions",
      assumedBy: new iam.FederatedPrincipal(
        oidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          },
          StringLike: {
            "token.actions.githubusercontent.com:sub": [
              `repo:${props.repo}:ref:refs/heads/main`,
            ],
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
      description: "Assumed by GitHub Actions on push to main to deploy typing-speed-dev.",
    });

    // Permission to assume CDK bootstrap roles in this account.
    // Bootstrap qualifier is the default `hnb659fds`.
    this.role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [
          `arn:aws:iam::${account}:role/cdk-hnb659fds-deploy-role-${account}-*`,
          `arn:aws:iam::${account}:role/cdk-hnb659fds-file-publishing-role-${account}-*`,
          `arn:aws:iam::${account}:role/cdk-hnb659fds-image-publishing-role-${account}-*`,
          `arn:aws:iam::${account}:role/cdk-hnb659fds-lookup-role-${account}-*`,
        ],
      })
    );

    // Permission to sync the built SPA into the site bucket.
    props.siteBucket.grantReadWrite(this.role);
    props.siteBucket.grantDelete(this.role);

    // Permission to invalidate CloudFront after upload.
    this.role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"],
        resources: [
          `arn:aws:cloudfront::${account}:distribution/${props.distribution.distributionId}`,
        ],
      })
    );

    new CfnOutput(scope, "GitHubActionsRoleArn", {
      value: this.role.roleArn,
      description: "Add this ARN as the AWS_DEPLOY_ROLE_ARN GitHub Actions variable.",
      exportName: "typing-speed-dev-github-actions-role-arn",
    });
  }
}
