#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { TypingSpeedStack } from "../lib/typing-speed-stack";

const app = new cdk.App();

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION ?? "eu-west-1";

const env: cdk.Environment = { account, region };

new TypingSpeedStack(app, "typing-speed-dev", {
  envName: "dev",
  env,
  description: "Typing speed app — development",
});

new TypingSpeedStack(app, "typing-speed-prod", {
  envName: "prod",
  env,
  description: "Typing speed app — production",
});

app.synth();
