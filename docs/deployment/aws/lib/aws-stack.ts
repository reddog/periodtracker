import {
  CfnOutput,
  CfnParameter,
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
  StackProps
} from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

const DATABASE_PASSWORD_PARAMETER = '/oky/database/master-password';
const DATABASE_USERNAME = 'pdtrkruatusr';
const DATABASE_NAME = 'pdtrkruat_db';
const DATABASE_SCHEMA = 'oky_en';

export class OkyAwsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const domainName = new CfnParameter(this, 'DomainName', {
      type: 'String',
      description: 'Root domain used by the Oky deployment (for example, okyapp.info).',
      allowedPattern: '^[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
      constraintDescription: 'Enter a valid root domain name.'
    });

    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 20
        }
      ]
    });

    const apiTaskSecurityGroup = new ec2.SecurityGroup(this, 'ApiTaskSecurityGroup', {
      vpc,
      description: 'Network access for the API task.',
      allowAllOutbound: true
    });
    const cmsTaskSecurityGroup = new ec2.SecurityGroup(this, 'CmsTaskSecurityGroup', {
      vpc,
      description: 'Network access for the CMS task.',
      allowAllOutbound: true
    });

    const endpointSecurityGroup = new ec2.SecurityGroup(this, 'VpcEndpointSecurityGroup', {
      vpc,
      description: 'HTTPS access to AWS interface endpoints from ECS tasks.',
      allowAllOutbound: true
    });
    endpointSecurityGroup.addIngressRule(apiTaskSecurityGroup, ec2.Port.tcp(443));
    endpointSecurityGroup.addIngressRule(cmsTaskSecurityGroup, ec2.Port.tcp(443));

    const privateSubnets = { subnetType: ec2.SubnetType.PRIVATE_ISOLATED };
    for (const service of [
      ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      ec2.InterfaceVpcEndpointAwsService.ECR,
      ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      ec2.InterfaceVpcEndpointAwsService.SSM
    ]) {
      vpc.addInterfaceEndpoint(`${service.shortName.replace(/[^a-zA-Z0-9]/g, '')}Endpoint`, {
        service,
        subnets: privateSubnets,
        securityGroups: [endpointSecurityGroup]
      });
    }

    const apiRepository = new ecr.Repository(this, 'ApiRepository', {
      repositoryName: 'oky/api_en',
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      imageScanOnPush: true,
      removalPolicy: RemovalPolicy.RETAIN
    });
    const cmsRepository = new ecr.Repository(this, 'CmsRepository', {
      repositoryName: 'oky/cms_en',
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      imageScanOnPush: true,
      removalPolicy: RemovalPolicy.RETAIN
    });

    const databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc,
      description: 'PostgreSQL access from the API and CMS task security groups.',
      allowAllOutbound: false
    });
    databaseSecurityGroup.addIngressRule(apiTaskSecurityGroup, ec2.Port.tcp(5432));
    databaseSecurityGroup.addIngressRule(cmsTaskSecurityGroup, ec2.Port.tcp(5432));

    const databasePassword = ssm.StringParameter.fromSecureStringParameterAttributes(
      this,
      'DatabasePasswordParameter',
      {
        parameterName: DATABASE_PASSWORD_PARAMETER,
        version: 1
      }
    );
    const database = new rds.DatabaseCluster(this, 'Database', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4
      }),
      credentials: rds.Credentials.fromPassword(
        DATABASE_USERNAME,
        SecretValue.ssmSecure(DATABASE_PASSWORD_PARAMETER, '1')
      ),
      defaultDatabaseName: DATABASE_NAME,
      writer: rds.ClusterInstance.serverlessV2('writer'),
      vpc,
      vpcSubnets: privateSubnets,
      securityGroups: [databaseSecurityGroup],
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 1,
      serverlessV2AutoPauseDuration: Duration.minutes(5),
      backup: { retention: Duration.days(7) },
      storageEncrypted: true,
      deletionProtection: true,
      removalPolicy: RemovalPolicy.SNAPSHOT
    });

    const cluster = new ecs.Cluster(this, 'EcsCluster', {
      vpc,
      clusterName: 'oky-ecs-cluster',
      enableFargateCapacityProviders: true
    });

    const apiLogGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: '/ecs/oky-ecs-api-task',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.RETAIN
    });
    const cmsLogGroup = new logs.LogGroup(this, 'CmsLogGroup', {
      logGroupName: '/ecs/oky-ecs-cms-task',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.RETAIN
    });

    const apiExecutionRole = this.createTaskExecutionRole('ApiTaskExecutionRole');
    const cmsExecutionRole = this.createTaskExecutionRole('CmsTaskExecutionRole');
    databasePassword.grantRead(apiExecutionRole);
    databasePassword.grantRead(cmsExecutionRole);

    const apiTask = new ecs.FargateTaskDefinition(this, 'ApiTaskDefinition', {
      family: 'oky-ecs-api-task',
      cpu: 512,
      memoryLimitMiB: 1024,
      executionRole: apiExecutionRole
    });
    const apiContainer = apiTask.addContainer('ApiContainer', {
      image: ecs.ContainerImage.fromEcrRepository(apiRepository, 'latest'),
      logging: ecs.LogDrivers.awsLogs({ logGroup: apiLogGroup, streamPrefix: 'api' }),
      environment: {
        NODE_ENV: 'production',
        API_PORT: '3000',
        DELETE_ACCOUNT_URL: `delete-account.${domainName.valueAsString}`,
        DATABASE_TYPE: 'postgres',
        DATABASE_SYNCHRONIZE: 'false',
        DATABASE_LOGGING: 'true',
        DATABASE_HOST: database.clusterEndpoint.hostname,
        DATABASE_PORT: '5432',
        DATABASE_NAME,
        DATABASE_SCHEMA,
        DATABASE_USERNAME
      },
      secrets: {
        DATABASE_PASSWORD: ecs.Secret.fromSsmParameter(databasePassword)
      }
    });
    apiContainer.addPortMappings({ containerPort: 3000, protocol: ecs.Protocol.TCP });

    const cmsTask = new ecs.FargateTaskDefinition(this, 'CmsTaskDefinition', {
      family: 'oky-ecs-cms-task',
      cpu: 512,
      memoryLimitMiB: 1024,
      executionRole: cmsExecutionRole
    });
    const cmsContainer = cmsTask.addContainer('CmsContainer', {
      image: ecs.ContainerImage.fromEcrRepository(cmsRepository, 'latest'),
      logging: ecs.LogDrivers.awsLogs({ logGroup: cmsLogGroup, streamPrefix: 'cms' }),
      environment: {
        NODE_ENV: 'production',
        CMS_PORT: '5000',
        DATABASE_TYPE: 'postgres',
        DATABASE_SYNCHRONIZE: 'false',
        DATABASE_LOGGING: 'false',
        DATABASE_HOST: database.clusterEndpoint.hostname,
        DATABASE_PORT: '5432',
        DATABASE_NAME,
        DATABASE_SCHEMA,
        DATABASE_USERNAME
      },
      secrets: {
        DATABASE_PASSWORD: ecs.Secret.fromSsmParameter(databasePassword)
      }
    });
    cmsContainer.addPortMappings({ containerPort: 5000, protocol: ecs.Protocol.TCP });

    const albKey = new kms.Key(this, 'AlbKey', {
      alias: 'oky-alb',
      description: 'KMS key reserved for Application Load Balancer encryption configuration.',
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN
    });

    new CfnOutput(this, 'VpcId', { value: vpc.vpcId });
    new CfnOutput(this, 'EcsClusterName', { value: cluster.clusterName });
    new CfnOutput(this, 'DatabaseEndpoint', { value: database.clusterEndpoint.hostname });
    new CfnOutput(this, 'ApiRepositoryUri', { value: apiRepository.repositoryUri });
    new CfnOutput(this, 'CmsRepositoryUri', { value: cmsRepository.repositoryUri });
    new CfnOutput(this, 'AlbKmsKeyArn', { value: albKey.keyArn });
  }

  private createTaskExecutionRole(id: string): iam.Role {
    return new iam.Role(this, id, {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy'
        )
      ]
    });
  }
}