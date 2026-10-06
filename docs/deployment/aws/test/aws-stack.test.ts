import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { OkyStack } from '../lib/oky-stack';

describe('OkyStack', () => {
  test('creates the foundational resources without deploying ECS services', () => {
    const app = new cdk.App();
    const stack = new OkyStack(app, 'TestStack');
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::EC2::Subnet', 4);
    template.resourceCountIs('AWS::EC2::VPCEndpoint', 4);
    template.resourceCountIs('AWS::ECR::Repository', 2);
    template.resourceCountIs('AWS::RDS::DBCluster', 1);
    template.resourceCountIs('AWS::RDS::DBInstance', 2);
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      EngineLifecycleSupport: 'open-source-rds-extended-support-disabled',
    });
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      PerformanceInsightsEnabled: true,
      PerformanceInsightsRetentionPeriod: 7,
    });
    template.resourceCountIs('AWS::ECS::Cluster', 1);
    template.resourceCountIs('AWS::ECS::TaskDefinition', 2);
    template.resourceCountIs('AWS::ECS::Service', 0);
    template.resourceCountIs('AWS::Logs::LogGroup', 2);
  });
});