# Oky AWS CDK

This standalone AWS CDK v2 TypeScript app provisions the initial AWS foundation in `eu-west-2`. It creates a two-AZ VPC with two public and two isolated private subnets, private endpoints for CloudWatch Logs, ECR, SSM Parameter Store, and S3, API and CMS ECR repositories, an Aurora PostgreSQL Serverless v2 cluster, an ECS cluster and task definitions, CloudWatch log groups, and a KMS key reserved for the ALB phase.

The task definitions reference `latest` in the new ECR repositories, but the CDK app does not build or push images and does not create ECS services. No containers are started until a later deployment step creates services after images have been pushed.

## Database password prerequisite

CloudFormation cannot create Systems Manager `SecureString` parameters. Before deploying, create `/oky/database/master-password` as an SSM Parameter Store `SecureString` in the target account and region. The stack uses that same encrypted value for the Aurora master password and injects it into both task definitions as `DATABASE_PASSWORD`. Keep the parameter version at `1` for this initial stack; changing its value requires coordinating a database password rotation.

Other application secrets from the existing env templates, such as `APPLICATION_SECRET`, `PASSPORT_SECRET`, and Firebase credentials, are intentionally not included as plaintext environment values. Their SSM parameter mapping will be added in a subsequent deployment step.

## Commands

```bash
npm install
npm run build
npm test
npx cdk synth
npx cdk deploy --parameters OkyAwsStack:DomainName=okyapp.info
```

Configure AWS credentials before synthesizing or deploying. The default region is `eu-west-2`; set `CDK_DEFAULT_REGION` to override it. Bootstrap the account and region once with `npx cdk bootstrap` before the first deployment.