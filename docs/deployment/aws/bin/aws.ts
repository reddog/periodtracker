#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { OkyAwsStack } from '../lib/aws-stack';

const app = new cdk.App();

new OkyAwsStack(app, 'OkyAwsStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'eu-west-2'
  }
});