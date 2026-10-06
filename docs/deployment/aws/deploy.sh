#!/bin/bash

# cdk deploy helper script

# Default values for deployment parameters

API_SERVICE_DOMAIN="api.okyapp.info"
CMS_SERVICE_DOMAIN="cms.okyapp.info"

API_SERVICE_DESIRED_COUNT=0
CMS_SERVICE_DESIRED_COUNT=0

API_SERVICE_CPU=512
API_SERVICE_MEMORY=1024
CMS_SERVICE_CPU=512
CMS_SERVICE_MEMORY=1024

DATABASE_SCHEMA="oky_en"
DATABASE_MIN_CAPACITY_UNITS=0
DATABASE_MAX_CAPACITY_UNITS=1
DATABASE_AUTO_PAUSE_DURATION_SECONDS=300
DATABASE_BACKUP_RETENTION_DAYS=7

DELETE_ACCOUNT_URL="https://api.okyapp.info/delete-account"

# Value of the Environment resource tag
DEPLOYMENT_ENVIRONMENT="production"
# Value of NODE_ENV in the API and CMS ECS tasks
NODE_ENV="production"

LOAD_BALANCER_CERTIFICATE_ARN="arn:aws:acm:region:account-id:certificate/certificate-id"

# Allow any parameter to be overridden by named command line parameter

# Allow passing of --profile
PROFILE=""

while [ $# -gt 0 ]; do
  case $1 in
  --profile)
    PROFILE="${2:?--profile requires a value}"
    shift 2
    ;;
  --api-service-domain)
    API_SERVICE_DOMAIN="${2:?--api-service-domain requires a value}"
    shift 2
    ;;
  --cms-service-domain)
    CMS_SERVICE_DOMAIN="${2:?--cms-service-domain requires a value}"
    shift 2
    ;;
  --api-service-desired-count)
    API_SERVICE_DESIRED_COUNT="${2:?--api-service-desired-count requires a value}"
    shift 2
    ;;
  --api-service-cpu)
    API_SERVICE_CPU="${2:?--api-service-cpu requires a value}"
    shift 2
    ;;
  --api-service-memory)
    API_SERVICE_MEMORY="${2:?--api-service-memory requires a value}"
    shift 2
    ;;
  --cms-service-desired-count)
    CMS_SERVICE_DESIRED_COUNT="${2:?--cms-service-desired-count requires a value}"
    shift 2
    ;;
  --cms-service-cpu)
    CMS_SERVICE_CPU="${2:?--cms-service-cpu requires a value}"
    shift 2
    ;;
  --cms-service-memory)
    CMS_SERVICE_MEMORY="${2:?--cms-service-memory requires a value}"
    shift 2
    ;;
  --database-schema)
    DATABASE_SCHEMA="${2:?--database-schema requires a value}"
    shift 2
    ;;
  --database-min-capacity-units)
    DATABASE_MIN_CAPACITY_UNITS="${2:?--database-min-capacity-units requires a value}"
    shift 2
    ;;
  --database-max-capacity-units)
    DATABASE_MAX_CAPACITY_UNITS="${2:?--database-max-capacity-units requires a value}"
    shift 2
    ;;
  --database-auto-pause-duration-seconds)
    DATABASE_AUTO_PAUSE_DURATION_SECONDS="${2:?--database-auto-pause-duration-seconds requires a value}"
    shift 2
    ;;
  --database-backup-retention-days)
    DATABASE_BACKUP_RETENTION_DAYS="${2:?--database-backup-retention-days requires a value}"
    shift 2
    ;;
  --delete-account-url)
    DELETE_ACCOUNT_URL="${2:?--delete-account-url requires a value}"
    shift 2
    ;;
  --deployment-environment)
    DEPLOYMENT_ENVIRONMENT="${2:?--deployment-environment requires a value}"
    shift 2
    ;;
  --node-env)
    NODE_ENV="${2:?--node-env requires a value}"
    shift 2
    ;;
  --load-balancer-certificate-arn)
    LOAD_BALANCER_CERTIFICATE_ARN="${2:?--load-balancer-certificate-arn requires a value}"
    shift 2
    ;;
  *)
    echo "Unknown argument: $1" >&2
    exit 1
    ;;
  esac
done

# Make a list of the CDK parameters
# Disable https for testing
# CDK_PARAMS=(
#   --parameters "OkyStack:ApiServiceDomainName=$API_SERVICE_DOMAIN"
#   --parameters "OkyStack:CmsServiceDomainName=$CMS_SERVICE_DOMAIN"
#   --parameters "OkyStack:ApiServiceCpu=$API_SERVICE_CPU"
#   --parameters "OkyStack:ApiServiceMemory=$API_SERVICE_MEMORY"
#   --parameters "OkyStack:CmsServiceCpu=$CMS_SERVICE_CPU"
#   --parameters "OkyStack:CmsServiceMemory=$CMS_SERVICE_MEMORY"
#   --parameters "OkyStack:DatabaseSchema=$DATABASE_SCHEMA"
#   --parameters "OkyStack:DatabaseMinCapacityUnits=$DATABASE_MIN_CAPACITY_UNITS"
#   --parameters "OkyStack:DatabaseMaxCapacityUnits=$DATABASE_MAX_CAPACITY_UNITS"
#   --parameters "OkyStack:DatabaseAutoPauseDurationSeconds=$DATABASE_AUTO_PAUSE_DURATION_SECONDS"
#   --parameters "OkyStack:DatabaseBackupRetentionDays=$DATABASE_BACKUP_RETENTION_DAYS"
#   --parameters "OkyStack:DeleteAccountUrl=$DELETE_ACCOUNT_URL"
#   --parameters "OkyStack:NodeEnv=$NODE_ENV"
#   --parameters "OkyStack:LoadBalancerCertificateArn=$LOAD_BALANCER_CERTIFICATE_ARN"
# )
CDK_PARAMS=(
  --parameters "OkyStack:ApiServiceDomainName=$API_SERVICE_DOMAIN"
  --parameters "OkyStack:CmsServiceDomainName=$CMS_SERVICE_DOMAIN"
  --parameters "OkyStack:ApiServiceDesiredCount=$API_SERVICE_DESIRED_COUNT"
  --parameters "OkyStack:CmsServiceDesiredCount=$CMS_SERVICE_DESIRED_COUNT"
  --parameters "OkyStack:ApiServiceCpu=$API_SERVICE_CPU"
  --parameters "OkyStack:ApiServiceMemory=$API_SERVICE_MEMORY"
  --parameters "OkyStack:CmsServiceCpu=$CMS_SERVICE_CPU"
  --parameters "OkyStack:CmsServiceMemory=$CMS_SERVICE_MEMORY"
  --parameters "OkyStack:DatabaseSchema=$DATABASE_SCHEMA"
  --parameters "OkyStack:DatabaseMinCapacityUnits=$DATABASE_MIN_CAPACITY_UNITS"
  --parameters "OkyStack:DatabaseMaxCapacityUnits=$DATABASE_MAX_CAPACITY_UNITS"
  --parameters "OkyStack:DatabaseAutoPauseDurationSeconds=$DATABASE_AUTO_PAUSE_DURATION_SECONDS"
  --parameters "OkyStack:DatabaseBackupRetentionDays=$DATABASE_BACKUP_RETENTION_DAYS"
  --parameters "OkyStack:DeleteAccountUrl=$DELETE_ACCOUNT_URL"
  --parameters "OkyStack:NodeEnv=$NODE_ENV"
)

PROFILE_ARGS=()
if [ -n "$PROFILE" ]; then
  PROFILE_ARGS=(--profile "$PROFILE")
fi

echo "Using AWS profile: $PROFILE"

# Resolve the target account and region from the selected profile
CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text "${PROFILE_ARGS[@]}") || {
  echo "Unable to resolve AWS account; check the profile and run 'aws sso login' if needed" >&2
  exit 1
}
CDK_DEFAULT_REGION=$(aws configure get region "${PROFILE_ARGS[@]}")
export CDK_DEFAULT_ACCOUNT
export CDK_DEFAULT_REGION="${CDK_DEFAULT_REGION:-eu-west-2}"

echo "Target account: $CDK_DEFAULT_ACCOUNT, region: $CDK_DEFAULT_REGION"
echo "Deploying OkyStack with the following parameters:"
printf '%s\n' "${CDK_PARAMS[@]}"

# Run CDK deploy with the parameters
cdk deploy OkyStack "${CDK_PARAMS[@]}" --tags "Environment=$DEPLOYMENT_ENVIRONMENT" --require-approval any-change "${PROFILE_ARGS[@]}"
