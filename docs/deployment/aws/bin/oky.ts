#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { OkyStack } from '../lib/oky-stack';

const app = new cdk.App();

new OkyStack(app, 'OkyStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'eu-west-2'
  }
});