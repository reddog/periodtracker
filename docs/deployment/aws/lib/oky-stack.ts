import {
  CfnOutput,
  CfnParameter,
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
  StackProps
} from 'aws-cdk-lib';
// import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

const PROJECT_NAME = 'Oky';
const DATABASE_CLUSTER_MASTER_USERNAME = 'clusteradmin';
const DATABASE_CLUSTER_DEFAULT_DATABASE_NAME = 'oky';
const DATABASE_CLUSTER_CREDENTIALS_SECRET_NAME = '/oky/database/credentials';
const APPLICATION_SECRET_SECRET_NAME = '/oky/api/application-secret';
const PASSPORT_SECRET_SECRET_NAME = '/oky/cms/passport-secret';
const GOOGLE_APPLICATION_CREDENTIALS_SECRET_NAME = '/oky/cms/google-application-credentials';
const FIREBASE_SERVICE_ACCOUNT_BASE64_SECRET_NAME = '/oky/cms/firebase-service-account-base64';
const POSTGRES_PORT = 5432;
const HTTPS_PORT = 443;
const API_SERVICE_PORT = 3000;
const CMS_SERVICE_PORT = 5000;
const POSTGRES_VERSION = rds.AuroraPostgresEngineVersion.VER_16_11;

export class OkyStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const apiServiceDomainName = new CfnParameter(this, 'ApiServiceDomainName', {
      type: 'String',
      description: 'Domain name for the API service (for example, api.okyapp.info).',
      allowedPattern: '^[a-zA-Z0-9.-]+$',
      constraintDescription: 'Enter a valid domain name (alphanumeric, dot, or hyphen).'
    });

    const cmsServiceDomainName = new CfnParameter(this, 'CmsServiceDomainName', {
      type: 'String',
      description: 'Domain name for the CMS service (for example, cms.okyapp.info).',
      allowedPattern: '^[a-zA-Z0-9.-]+$',
      constraintDescription: 'Enter a valid domain name (alphanumeric, dot, or hyphen).'
    });

    const apiServiceDesiredCount = new CfnParameter(this, 'ApiServiceDesiredCount', {
      type: 'Number',
      description: 'API service ECS Task, desired count.',
      default: 0,
      minValue: 0,
      maxValue: 10
    });
    const apiServiceCpu = new CfnParameter(this, 'ApiServiceCpu', {
      type: 'Number',
      description: 'API service ECS Task, CPU units.',
      default: 512,
      minValue: 128,
      maxValue: 1024
    });
    const apiServiceMemory = new CfnParameter(this, 'ApiServiceMemory', {
      type: 'Number',
      description: 'API service ECS Task, Memory (in MiB).',
      default: 1024,
      minValue: 512,
      maxValue: 4096
    });

    const cmsServiceDesiredCount = new CfnParameter(this, 'CmsServiceDesiredCount', {
      type: 'Number',
      description: 'CMS service ECS Task, desired count.',
      default: 0,
      minValue: 0,
      maxValue: 10
    });
    const cmsServiceCpu = new CfnParameter(this, 'CmsServiceCpu', {
      type: 'Number',
      description: 'CMS service ECS Task, CPU units.',
      default: 512,
      minValue: 128,
      maxValue: 1024
    });
    const cmsServiceMemory = new CfnParameter(this, 'CmsServiceMemory', {
      type: 'Number',
      description: 'CMS service ECS Task, Memory (in MiB).',
      default: 1024,
      minValue: 512,
      maxValue: 4096
    });

    const databaseSchema = new CfnParameter(this, 'DatabaseSchema', {
      type: 'String',
      description: 'User database schema for ECS Tasks.',
      allowedPattern: '^[a-zA-Z0-9._-]{1,32}$',
      constraintDescription: 'Enter a valid database schema (1-32 characters, alphanumeric, underscore, hyphen, or dot).'
    });

    const databaseMinCapacityUnits = new CfnParameter(this, 'DatabaseMinCapacityUnits', {
      type: 'Number',
      description: 'Aurora Postgres backend user database, minimum capacity units.',
      default: 0,
      minValue: 0,
      maxValue: 16
    });
    const databaseMaxCapacityUnits = new CfnParameter(this, 'DatabaseMaxCapacityUnits', {
      type: 'Number',
      description: 'Aurora Postgres backend user database, maximum capacity units.',
      default: 1,
      minValue: 1,
      maxValue: 16
    });
    const databaseAutoPauseDurationSeconds = new CfnParameter(this, 'DatabaseAutoPauseDurationSeconds', {
      type: 'Number',
      description: 'Aurora Postgres backend user database, auto-pause duration (in seconds) .',
      default: 300,
      minValue: 0,
      maxValue: 86400
    });
    const databaseBackupRetentionDays = new CfnParameter(this, 'DatabaseBackupRetentionDays', {
      type: 'Number',
      description: 'Aurora Postgres backend user database, backup retention period (in days).',
      default: 7,
      minValue: 1,
      maxValue: 35
    });

    const deleteAccountUrl = new CfnParameter(this, 'DeleteAccountUrl', {
      type: 'String',
      description: 'URL for the delete account endpoint.',
    });

    const nodeEnv = new CfnParameter(this, 'NodeEnv', {
      type: 'String',
      description: 'Value of NODE_ENV in the API and CMS ECS tasks.',
      allowedPattern: '^[a-zA-Z0-9._-]{1,32}$',
      constraintDescription: 'Enter a valid NODE_ENV value (1-32 characters, alphanumeric, underscore, hyphen, or dot).'
    });

    // const loadBalancerCertificateArn = new CfnParameter(this, 'LoadBalancerCertificateArn', {
    //   type: 'String',
    //   description: 'ARN of the existing ACM certificate for the load balancer.',
    //   allowedPattern: '^arn:aws:acm:[a-z0-9-]+:[0-9]{12}:certificate/[a-f0-9-]+$',
    //   constraintDescription: 'Enter a valid ACM certificate ARN.'
    // });

    // The Environment tag is passed via `cdk deploy --tags` because tag values can't be CloudFormation tokens.
    Stack.of(this).tags.setTag('Project', PROJECT_NAME);

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
      ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER
    ]) {
        const endpointName = `${service.shortName.replace(/[^a-zA-Z0-9]/g, '')}Endpoint`;
        vpc.addInterfaceEndpoint(endpointName, {
          service,
          subnets: privateSubnets,
          securityGroups: [endpointSecurityGroup]
        });
    }

    const apiRepository = new ecr.Repository(this, 'ApiRepository', {
      repositoryName: PROJECT_NAME.toLowerCase() + '/api',
      imageTagMutability: ecr.TagMutability.MUTABLE,
      imageScanOnPush: true,
      // Retain the repository even if the stack is deleted - fully delete whilst testing
      // removalPolicy: RemovalPolicy.RETAIN
      removalPolicy: RemovalPolicy.DESTROY
    });
    const cmsRepository = new ecr.Repository(this, 'CmsRepository', {
      repositoryName: PROJECT_NAME.toLowerCase() + '/cms',
      imageTagMutability: ecr.TagMutability.MUTABLE,
      imageScanOnPush: true,
      // Retain the repository even if the stack is deleted - fully delete whilst testing
      // removalPolicy: RemovalPolicy.RETAIN
      removalPolicy: RemovalPolicy.DESTROY
    });

    const databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc,
      description: 'PostgreSQL access from the API and CMS ECS Task security groups.',
      allowAllOutbound: false
    });
    databaseSecurityGroup.addIngressRule(apiTaskSecurityGroup, ec2.Port.tcp(POSTGRES_PORT));
    databaseSecurityGroup.addIngressRule(cmsTaskSecurityGroup, ec2.Port.tcp(POSTGRES_PORT));

    const applicationSecretsKey = new kms.Key(this, 'ApplicationSecretsKey', {
      alias: 'alias/application-secrets-key',
      description: 'CMK for encrypting API and CMS ECS Task application secrets.',
      enableKeyRotation: true,
      // Retain the repository even if the stack is deleted - fully delete whilst testing
      // removalPolicy: RemovalPolicy.RETAIN
      removalPolicy: RemovalPolicy.DESTROY
    });

    const replaceableSecretValue = SecretValue.unsafePlainText('REPLACE');
    const applicationSecretSecret = new secretsmanager.Secret (
      this,
      'ApplicationSecretSecret',
      {
        secretName: APPLICATION_SECRET_SECRET_NAME,
        secretStringValue: replaceableSecretValue,
        encryptionKey: applicationSecretsKey,
      }
    );
    const passportSecretSecret = new secretsmanager.Secret(
      this,
      'PassportSecretSecret',
      {
        secretName: PASSPORT_SECRET_SECRET_NAME,
        secretStringValue: replaceableSecretValue,
        encryptionKey: applicationSecretsKey,
      }
    );
    const googleApplicationCredentialsSecret = new secretsmanager.Secret(
      this,
      'GoogleApplicationCredentialsSecret',
      {
        secretName: GOOGLE_APPLICATION_CREDENTIALS_SECRET_NAME,
        secretStringValue: replaceableSecretValue,
        encryptionKey: applicationSecretsKey,
      }
    );
    const firebaseServiceAccountBase64Secret = new secretsmanager.Secret(
      this,
      'FirebaseServiceAccountBase64Secret',
      {
        secretName: FIREBASE_SERVICE_ACCOUNT_BASE64_SECRET_NAME,
        secretStringValue: replaceableSecretValue,
        encryptionKey: applicationSecretsKey,
      }
    );

    const databaseStorageKey = new kms.Key(this, 'DatabaseStorageKey', {
      alias: 'alias/database-storage-key',
      description: 'CMK for encrypting the database storage.',
      enableKeyRotation: true,
      // Retain the repository even if the stack is deleted - fully delete whilst testing
      // removalPolicy: RemovalPolicy.RETAIN
      removalPolicy: RemovalPolicy.DESTROY
    });

    const database = new rds.DatabaseCluster(this, 'Database', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: POSTGRES_VERSION
      }),
      credentials: rds.Credentials.fromGeneratedSecret(DATABASE_CLUSTER_MASTER_USERNAME, {
        secretName: DATABASE_CLUSTER_CREDENTIALS_SECRET_NAME,
        encryptionKey: applicationSecretsKey,
      }),
      defaultDatabaseName: DATABASE_CLUSTER_DEFAULT_DATABASE_NAME,
      writer: rds.ClusterInstance.serverlessV2('writer', {
        availabilityZone: vpc.isolatedSubnets[0].availabilityZone,
        enablePerformanceInsights: true,
        performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
      }),
      readers: [rds.ClusterInstance.serverlessV2('reader', {
        availabilityZone: vpc.isolatedSubnets[1].availabilityZone,
        enablePerformanceInsights: true,
        performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
        scaleWithWriter: true,
      })],
      vpc,
      vpcSubnets: privateSubnets,
      securityGroups: [databaseSecurityGroup],
      serverlessV2MinCapacity: databaseMinCapacityUnits.valueAsNumber,
      serverlessV2MaxCapacity: databaseMaxCapacityUnits.valueAsNumber,
      serverlessV2AutoPauseDuration: Duration.seconds(databaseAutoPauseDurationSeconds.valueAsNumber),
      enablePerformanceInsights: true,
      performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
      databaseInsightsMode: rds.DatabaseInsightsMode.STANDARD,
      engineLifecycleSupport: rds.EngineLifecycleSupport.OPEN_SOURCE_RDS_EXTENDED_SUPPORT_DISABLED,
      backup: { retention: Duration.days(databaseBackupRetentionDays.valueAsNumber) },
      storageEncrypted: true,
      storageEncryptionKey: databaseStorageKey,
      // Deletion protection is disabled for testing purposes.
      // deletionProtection: true,
      deletionProtection: false,
      // Retain the repository even if the stack is deleted - fully delete whilst testing
      // removalPolicy: RemovalPolicy.RETAIN
      removalPolicy: RemovalPolicy.DESTROY
    });

    const ecsCluster = new ecs.Cluster(this, 'EcsCluster', {
      vpc,
      clusterName: PROJECT_NAME.toLowerCase() + '-ecs-cluster',
      enableFargateCapacityProviders: true
    });

    const apiLogGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: '/ecs/' + PROJECT_NAME.toLowerCase() + '-ecs-api-task',
      retention: logs.RetentionDays.ONE_WEEK,
      // Retain the repository even if the stack is deleted - fully delete whilst testing
      // removalPolicy: RemovalPolicy.RETAIN
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const cmsLogGroup = new logs.LogGroup(this, 'CmsLogGroup', {
      logGroupName: '/ecs/' + PROJECT_NAME.toLowerCase() + '-ecs-cms-task',
      retention: logs.RetentionDays.ONE_WEEK,
      // Retain the repository even if the stack is deleted - fully delete whilst testing
      // removalPolicy: RemovalPolicy.RETAIN
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const apiExecutionRole = this.createTaskExecutionRole('ApiTaskExecutionRole');
    const cmsExecutionRole = this.createTaskExecutionRole('CmsTaskExecutionRole');

    applicationSecretSecret.grantRead(apiExecutionRole);
    passportSecretSecret.grantRead(cmsExecutionRole);
    googleApplicationCredentialsSecret.grantRead(cmsExecutionRole);
    firebaseServiceAccountBase64Secret.grantRead(cmsExecutionRole);

    database.secret!.grantRead(apiExecutionRole);
    database.secret!.grantRead(cmsExecutionRole);

    const apiTask = new ecs.FargateTaskDefinition(this, 'ApiTaskDefinition', {
      family: PROJECT_NAME.toLowerCase() + '-ecs-api-task',
      cpu: apiServiceCpu.valueAsNumber,
      memoryLimitMiB: apiServiceMemory.valueAsNumber,
      executionRole: apiExecutionRole
    });
    const apiContainer = apiTask.addContainer('ApiContainer', {
      image: ecs.ContainerImage.fromEcrRepository(apiRepository, 'latest'),
      logging: ecs.LogDrivers.awsLogs({ logGroup: apiLogGroup, streamPrefix: 'api' }),
      environment: {
        NODE_ENV: nodeEnv.valueAsString,
        DELETE_ACCOUNT_URL: deleteAccountUrl.valueAsString,
        API_PORT: API_SERVICE_PORT.toString(),
        DATABASE_TYPE: 'postgres',
        DATABASE_SYNCHRONIZE: 'false',
        DATABASE_LOGGING: 'true',
        DATABASE_HOST: database.instanceEndpoints[0].hostname,
        DATABASE_PORT: database.instanceEndpoints[0].port.toString(),
        DATABASE_NAME: DATABASE_CLUSTER_DEFAULT_DATABASE_NAME,
        DATABASE_SCHEMA: databaseSchema.valueAsString,
        USE_AVATAR_CUSTOMIZATION: 'true'
      },
      secrets: {
        APPLICATION_SECRET: ecs.Secret.fromSecretsManager(applicationSecretSecret),
        DATABASE_USERNAME: ecs.Secret.fromSecretsManager(database.secret!, 'username'),
        DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(database.secret!, 'password'),
      }
    });
    apiContainer.addPortMappings({ containerPort: API_SERVICE_PORT, protocol: ecs.Protocol.TCP });

    const cmsTask = new ecs.FargateTaskDefinition(this, 'CmsTaskDefinition', {
      family: PROJECT_NAME.toLowerCase() + '-ecs-cms-task',
      cpu: cmsServiceCpu.valueAsNumber,
      memoryLimitMiB: cmsServiceMemory.valueAsNumber,
      executionRole: cmsExecutionRole
    });
    const cmsContainer = cmsTask.addContainer('CmsContainer', {
      image: ecs.ContainerImage.fromEcrRepository(cmsRepository, 'latest'),
      logging: ecs.LogDrivers.awsLogs({ logGroup: cmsLogGroup, streamPrefix: 'cms' }),
      environment: {
        NODE_ENV: nodeEnv.valueAsString,
        DATABASE_TYPE: 'postgres',
        DATABASE_SYNCHRONIZE: 'false',
        DATABASE_LOGGING: 'false',
        DATABASE_HOST: database.instanceEndpoints[0].hostname,
        DATABASE_PORT: database.instanceEndpoints[0].port.toString(),
        DATABASE_NAME: DATABASE_CLUSTER_DEFAULT_DATABASE_NAME,
        DATABASE_SCHEMA: databaseSchema.valueAsString,
      },
      secrets: {
        PASSPORT_SECRET: ecs.Secret.fromSecretsManager(passportSecretSecret),
        GOOGLE_APPLICATION_CREDENTIALS: ecs.Secret.fromSecretsManager(googleApplicationCredentialsSecret),
        FIREBASE_SERVICE_ACCOUNT_BASE64: ecs.Secret.fromSecretsManager(firebaseServiceAccountBase64Secret),
        DATABASE_USERNAME: ecs.Secret.fromSecretsManager(database.secret!, 'username'),
        DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(database.secret!, 'password'),
      }
    });
    cmsContainer.addPortMappings({ containerPort: CMS_SERVICE_PORT, protocol: ecs.Protocol.TCP });

    const apiService = new ecs.FargateService(this, 'ApiService', {
      cluster: ecsCluster,
      taskDefinition: apiTask,
      desiredCount: apiServiceDesiredCount.valueAsNumber,
      assignPublicIp: true,
      securityGroups: [apiTaskSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      healthCheckGracePeriod: Duration.seconds(60),
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,
      maxHealthyPercent: 200
    });

    const cmsService = new ecs.FargateService(this, 'CmsService', {
      cluster: ecsCluster,
      taskDefinition: cmsTask,
      desiredCount: cmsServiceDesiredCount.valueAsNumber,
      assignPublicIp: true,
      securityGroups: [cmsTaskSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      healthCheckGracePeriod: Duration.seconds(60),
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,
      maxHealthyPercent: 200
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

    // const loadBalancerCertificate = acm.Certificate.fromCertificateArn(
    //   this,
    //   'LoadBalancerCertificate',
    //   loadBalancerCertificateArn.valueAsString
    // );
    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
      vpc,
      internetFacing: true
    });
    // Disable for testing - cert not yet issued
    // const listener = loadBalancer.addListener('HttpsListener', {
    //   port: 443,
    //   certificates: [
    //     loadBalancerCertificate
    //   ],
    //   defaultAction: elbv2.ListenerAction.forward([apiTargetGroup])
    // });
    // // redirect http to https
    // const httpListener = loadBalancer.addListener('HttpListener', {
    //   port: 80,
    //   defaultAction: elbv2.ListenerAction.redirect({
    //     protocol: 'HTTPS',
    //     port: '443',
    //     permanent: true
    //   })
    // });
    const httpListener = loadBalancer.addListener('HttpListener', {
      port: 80,
      defaultAction: elbv2.ListenerAction.forward([apiTargetGroup])
      // defaultAction: elbv2.ListenerAction.redirect({
      //   protocol: 'HTTPS',
      //   port: '443',
      //   permanent: true
      // })
    });
    // add rules for api and cms subdomains
    httpListener.addAction('ApiRule', {
      priority: 1,
      conditions: [
        elbv2.ListenerCondition.hostHeaders([apiServiceDomainName.valueAsString])
      ],
      action: elbv2.ListenerAction.forward([apiTargetGroup])
    });

    httpListener.addAction('CmsRule', {
      priority: 2,
      conditions: [
        elbv2.ListenerCondition.hostHeaders([cmsServiceDomainName.valueAsString])
      ],
      action: elbv2.ListenerAction.forward([cmsTargetGroup])
    });

    apiService.attachToApplicationTargetGroup(apiTargetGroup);
    cmsService.attachToApplicationTargetGroup(cmsTargetGroup);

    new CfnOutput(this, 'VpcId', { value: vpc.vpcId });
    new CfnOutput(this, 'EcsClusterName', { value: ecsCluster.clusterName });
    new CfnOutput(this, 'DatabaseEndpoint', { value: database.clusterEndpoint.hostname });
    new CfnOutput(this, 'ApiRepositoryUri', { value: apiRepository.repositoryUri });
    new CfnOutput(this, 'CmsRepositoryUri', { value: cmsRepository.repositoryUri });
    new CfnOutput(this, 'LoadBalancerDnsName', { value: loadBalancer.loadBalancerDnsName });
    // new CfnOutput(this, 'SSLCertificateArn', { value: loadBalancerCertificate.certificateArn });
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