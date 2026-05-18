#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { TypingSpeedStack } from "../lib/typing-speed-stack";

const app = new cdk.App();

cdk.Tags.of(app).add("Project", "typing-speed-test");

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION ?? "eu-west-1";

const env: cdk.Environment = { account, region };

new TypingSpeedStack(app, "typing-speed-dev", {
  envName: "dev",
  env,
  description: "Typing speed app — development",
});

app.synth();
