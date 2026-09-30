import {
  CfnOutput,
  CfnParameter,
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
  StackProps
} from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

const PROJECT_NAME = 'Oky';
const DATABASE_PASSWORD_PARAMETER = '/oky/database/password';
const APPLICATION_SECRET_PARAMETER = '/oky/api/application-secret';
const PASSPORT_SECRET_PARAMETER = '/oky/cms/passport-secret';
const GOOGLE_APPLICATION_CREDENTIALS_PARAMETER = '/oky/cms/google-application-credentials';
const POSTGRES_PORT = 5432;
const HTTPS_PORT = 443;
const API_SERVICE_PORT = 3000;
const CMS_SERVICE_PORT = 5000;
const POSTGRES_VERSION = rds.AuroraPostgresEngineVersion.VER_16_4;

export class OkyAwsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const domainName = new CfnParameter(this, 'DomainName', {
      type: 'String',
      description: 'Root domain used by the Oky deployment (for example, okyapp.info).',
      allowedPattern: '^[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
      constraintDescription: 'Enter a valid root domain name.'
    });

    const apiServiceSubdomain = new CfnParameter(this, 'ApiServiceSubdomain', {
      type: 'String',
      description: 'Subdomain for the API service (for example, api).',
      allowedPattern: '^[a-zA-Z0-9.-]+$',
      constraintDescription: 'Enter a valid subdomain name (alphanumeric, dot, or hyphen).'
    });

    const cmsServiceSubdomain = new CfnParameter(this, 'CmsServiceSubdomain', {
      type: 'String',
      description: 'Subdomain for the CMS service (for example, cms).',
      allowedPattern: '^[a-zA-Z0-9.-]+$',
      constraintDescription: 'Enter a valid subdomain name (alphanumeric, dot, or hyphen).'
    });

    const apiServiceCpu = new CfnParameter(this, 'ApiServiceCpu', {
      type: 'Number',
      description: 'CPU units for the API service task.',
      default: 512,
      minValue: 128,
      maxValue: 1024
    });
    const apiServiceMemory = new CfnParameter(this, 'ApiServiceMemory', {
      type: 'Number',
      description: 'Memory (in MiB) for the API service task.',
      default: 1024,
      minValue: 512,
      maxValue: 4096
    });

    const cmsServiceCpu = new CfnParameter(this, 'CmsServiceCpu', {
      type: 'Number',
      description: 'CPU units for the CMS service task.',
      default: 512,
      minValue: 128,
      maxValue: 1024
    });
    const cmsServiceMemory = new CfnParameter(this, 'CmsServiceMemory', {
      type: 'Number',
      description: 'Memory (in MiB) for the CMS service task.',
      default: 1024,
      minValue: 512,
      maxValue: 4096
    });

    const databaseUsername = new CfnParameter(this, 'DatabaseUsername', {
      type: 'String',
      description: 'Database username for the Oky deployment.',
      allowedPattern: '^[a-zA-Z0-9._-]{1,32}$',
      constraintDescription: 'Enter a valid database username (1-32 characters, alphanumeric, underscore, hyphen, or dot).'
    });

    const databaseName = new CfnParameter(this, 'DatabaseName', {
      type: 'String',
      description: 'Database name for the Oky deployment.',
      allowedPattern: '^[a-zA-Z0-9._-]{1,32}$',
      constraintDescription: 'Enter a valid database name (1-32 characters, alphanumeric, underscore, hyphen, or dot).'
    });

    const databaseSchema = new CfnParameter(this, 'DatabaseSchema', {
      type: 'String',
      description: 'Database schema for the Oky deployment.',
      allowedPattern: '^[a-zA-Z0-9._-]{1,32}$',
      constraintDescription: 'Enter a valid database schema (1-32 characters, alphanumeric, underscore, hyphen, or dot).'
    });

    const databaseMinCapacityUnits = new CfnParameter(this, 'DatabaseMinCapacityUnits', {
      type: 'Number',
      description: 'Minimum capacity units for the database.',
      default: 0,
      minValue: 0,
      maxValue: 16
    });
    const databaseMaxCapacityUnits = new CfnParameter(this, 'DatabaseMaxCapacityUnits', {
      type: 'Number',
      description: 'Maximum capacity units for the database.',
      default: 1,
      minValue: 1,
      maxValue: 16
    });
    const databaseAutoPauseDurationSeconds = new CfnParameter(this, 'DatabaseAutoPauseDurationSeconds', {
      type: 'Number',
      description: 'Auto pause duration (in seconds) for the database.',
      default: 300,
      minValue: 0,
      maxValue: 86400
    });
    const databaseBackupRetentionDays = new CfnParameter(this, 'DatabaseBackupRetentionDays', {
      type: 'Number',
      description: 'Backup retention period (in days) for the database.',
      default: 7,
      minValue: 1,
      maxValue: 35
    });

    const deleteAccountUrl = new CfnParameter(this, 'DeleteAccountUrl', {
      type: 'String',
      description: 'URL for the delete account endpoint.',
    });

    const environment = new CfnParameter(this, 'Environment', {
      type: 'String',
      description: 'Deployment environment for the Oky deployment.',
      allowedPattern: '^[a-zA-Z0-9._-]{1,32}$',
      constraintDescription: 'Enter a valid environment name (1-32 characters, alphanumeric, underscore, hyphen, or dot).'
    });

    // Tags to apply to all resources in this stack.
    Stack.of(this).tags.setTag('Project', PROJECT_NAME);
    Stack.of(this).tags.setTag('Environment', environment.valueAsString);

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
    endpointSecurityGroup.addIngressRule(apiTaskSecurityGroup, ec2.Port.tcp(HTTPS_PORT));
    endpointSecurityGroup.addIngressRule(cmsTaskSecurityGroup, ec2.Port.tcp(HTTPS_PORT));

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
      repositoryName: 'oky/api',
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      imageScanOnPush: true,
      removalPolicy: RemovalPolicy.RETAIN
    });
    const cmsRepository = new ecr.Repository(this, 'CmsRepository', {
      repositoryName: 'oky/cms',
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      imageScanOnPush: true,
      removalPolicy: RemovalPolicy.RETAIN
    });

    const databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc,
      description: 'PostgreSQL access from the API and CMS task security groups.',
      allowAllOutbound: false
    });
    databaseSecurityGroup.addIngressRule(apiTaskSecurityGroup, ec2.Port.tcp(POSTGRES_PORT));
    databaseSecurityGroup.addIngressRule(cmsTaskSecurityGroup, ec2.Port.tcp(POSTGRES_PORT));

    const databasePassword = ssm.StringParameter.fromSecureStringParameterAttributes(
      this,
      'DatabasePasswordParameter',
      {
        parameterName: DATABASE_PASSWORD_PARAMETER,
        version: 1
      }
    );
    const applicationSecret = ssm.StringParameter.fromSecureStringParameterAttributes(
      this,
      'ApplicationSecretParameter',
      {
        parameterName: APPLICATION_SECRET_PARAMETER,
        version: 1
      }
    );
    const passportSecret = ssm.StringParameter.fromSecureStringParameterAttributes(
      this,
      'PassportSecretParameter',
      {
        parameterName: PASSPORT_SECRET_PARAMETER,
        version: 1
      }
    );

    const googleApplicationCredentials = ssm.StringParameter.fromSecureStringParameterAttributes(
      this,
      'GoogleApplicationCredentialsParameter',
      {
        parameterName: GOOGLE_APPLICATION_CREDENTIALS_PARAMETER,
        version: 1
      }
    );
    // Create CMK for encrypting the database storage.
    const databaseKey = new kms.Key(this, 'DatabaseKey', {
      alias: 'alias/database-key',
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN
    });

    const database = new rds.DatabaseCluster(this, 'Database', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: POSTGRES_VERSION
      }),
      credentials: rds.Credentials.fromPassword(
        databaseUsername.valueAsString,
        SecretValue.ssmSecure(DATABASE_PASSWORD_PARAMETER, '1')
      ),
      defaultDatabaseName: databaseName.valueAsString,
      writer: rds.ClusterInstance.serverlessV2('writer'),
      vpc,
      vpcSubnets: privateSubnets,
      securityGroups: [databaseSecurityGroup],
      serverlessV2MinCapacity: databaseMinCapacityUnits.valueAsNumber,
      serverlessV2MaxCapacity: databaseMaxCapacityUnits.valueAsNumber,
      serverlessV2AutoPauseDuration: Duration.seconds(databaseAutoPauseDurationSeconds.valueAsNumber),
      backup: { retention: Duration.days(databaseBackupRetentionDays.valueAsNumber) },
      storageEncrypted: true,
      storageEncryptionKey: databaseKey,
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
    applicationSecret.grantRead(apiExecutionRole);
    passportSecret.grantRead(cmsExecutionRole);
    googleApplicationCredentials.grantRead(cmsExecutionRole);

    const apiTask = new ecs.FargateTaskDefinition(this, 'ApiTaskDefinition', {
      family: 'oky-ecs-api-task',
      cpu: apiServiceCpu.valueAsNumber,
      memoryLimitMiB: apiServiceMemory.valueAsNumber,
      executionRole: apiExecutionRole
    });
    const apiContainer = apiTask.addContainer('ApiContainer', {
      image: ecs.ContainerImage.fromEcrRepository(apiRepository, 'latest'),
      logging: ecs.LogDrivers.awsLogs({ logGroup: apiLogGroup, streamPrefix: 'api' }),
      environment: {
        NODE_ENV: 'production',
        DELETE_ACCOUNT_URL: deleteAccountUrl.valueAsString,
        API_PORT: API_SERVICE_PORT.toString(),
        DATABASE_TYPE: 'postgres',
        DATABASE_SYNCHRONIZE: 'false',
        DATABASE_LOGGING: 'true',
        DATABASE_HOST: database.clusterEndpoint.hostname,
        DATABASE_PORT: POSTGRES_PORT.toString(),
        DATABASE_NAME: databaseName.valueAsString,
        DATABASE_SCHEMA: databaseSchema.valueAsString,
        DATABASE_USERNAME: databaseUsername.valueAsString
      },
      secrets: {
        APPLICATION_SECRET: ecs.Secret.fromSsmParameter(applicationSecret),
        DATABASE_PASSWORD: ecs.Secret.fromSsmParameter(databasePassword)
      }
    });
    apiContainer.addPortMappings({ containerPort: API_SERVICE_PORT, protocol: ecs.Protocol.TCP });

    const cmsTask = new ecs.FargateTaskDefinition(this, 'CmsTaskDefinition', {
      family: 'oky-ecs-cms-task',
      cpu: cmsServiceCpu.valueAsNumber,
      memoryLimitMiB: cmsServiceMemory.valueAsNumber,
      executionRole: cmsExecutionRole
    });
    const cmsContainer = cmsTask.addContainer('CmsContainer', {
      image: ecs.ContainerImage.fromEcrRepository(cmsRepository, 'latest'),
      logging: ecs.LogDrivers.awsLogs({ logGroup: cmsLogGroup, streamPrefix: 'cms' }),
      environment: {
        NODE_ENV: 'production',
        DATABASE_TYPE: 'postgres',
        DATABASE_SYNCHRONIZE: 'false',
        DATABASE_LOGGING: 'false',
        DATABASE_HOST: database.clusterEndpoint.hostname,
        DATABASE_PORT: POSTGRES_PORT.toString(),
        DATABASE_NAME: databaseName.valueAsString,
        DATABASE_SCHEMA: databaseSchema.valueAsString,
        DATABASE_USERNAME: databaseUsername.valueAsString
      },
      secrets: {
        PASSPORT_SECRET: ecs.Secret.fromSsmParameter(passportSecret),
        GOOGLE_APPLICATION_CREDENTIALS: ecs.Secret.fromSsmParameter(googleApplicationCredentials)
      }
    });
    cmsContainer.addPortMappings({ containerPort: CMS_SERVICE_PORT, protocol: ecs.Protocol.TCP });

    const apiService = new ecs.FargateService(this, 'ApiService', {
      cluster,
      taskDefinition: apiTask,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [apiTaskSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      healthCheckGracePeriod: Duration.seconds(60)
    });

    const cmsService = new ecs.FargateService(this, 'CmsService', {
      cluster,
      taskDefinition: cmsTask,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [cmsTaskSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      healthCheckGracePeriod: Duration.seconds(60)
    });

    const loadBalancerCertificate = new acm.Certificate(this, 'LoadBalancerCert', {
      domainName: `${apiServiceSubdomain.valueAsString}.${domainName.valueAsString}`,
      subjectAlternativeNames: [`${cmsServiceSubdomain.valueAsString}.${domainName.valueAsString}`],
      validation: acm.CertificateValidation.fromDns(),
    });

    const apiTargetGroup = new elbv2.ApplicationTargetGroup(this, 'ApiTargetGroup', {
      vpc,
      port: API_SERVICE_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/health',
        interval: Duration.seconds(30)
      }
    });

    const cmsTargetGroup = new elbv2.ApplicationTargetGroup(this, 'CmsTargetGroup', {
      vpc,
      port: CMS_SERVICE_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/health',
        interval: Duration.seconds(30)
      }
    });

    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
      vpc,
      internetFacing: true
    });
    const listener = loadBalancer.addListener('HttpsListener', {
      port: 443,
      certificates: [loadBalancerCertificate],
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Not Found'
      })
    });
    // redirect http to https
    loadBalancer.addListener('HttpListener', {
      port: 80,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true
      })
    });
    // add rules for api and cms subdomains
    listener.addAction('ApiRule', {
      priority: 1,
      conditions: [
        elbv2.ListenerCondition.hostHeaders([`${apiServiceSubdomain.valueAsString}.${domainName.valueAsString}`])
      ],
      action: elbv2.ListenerAction.forward([apiTargetGroup])
    });

    listener.addAction('CmsRule', {
      priority: 2,
      conditions: [
        elbv2.ListenerCondition.hostHeaders([`${cmsServiceSubdomain.valueAsString}.${domainName.valueAsString}`])
      ],
      action: elbv2.ListenerAction.forward([cmsTargetGroup])
    });

    listener.addAction('DefaultRule', {
      action: elbv2.ListenerAction.forward([apiTargetGroup])
    });

    apiService.attachToApplicationTargetGroup(apiTargetGroup);
    cmsService.attachToApplicationTargetGroup(cmsTargetGroup);

    new CfnOutput(this, 'VpcId', { value: vpc.vpcId });
    new CfnOutput(this, 'EcsClusterName', { value: cluster.clusterName });
    new CfnOutput(this, 'DatabaseEndpoint', { value: database.clusterEndpoint.hostname });
    new CfnOutput(this, 'ApiRepositoryUri', { value: apiRepository.repositoryUri });
    new CfnOutput(this, 'CmsRepositoryUri', { value: cmsRepository.repositoryUri });
    new CfnOutput(this, 'LoadBalancerDnsName', { value: loadBalancer.loadBalancerDnsName });
    new CfnOutput(this, 'SSLCertificateArn', { value: loadBalancerCertificate.certificateArn });
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