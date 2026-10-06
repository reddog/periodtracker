#!/bin/bash

# Script to deploy the OkyStack with concrete parameters

LB_ARN="arn:aws:acm:eu-west-2:805516212678:certificate/5262fbdc-fa45-4171-9062-ea4939818f76"

# ./deploy.sh --load-balancer-certificate-arn "$LB_ARN" --profile oky-iac-dev
# disable https for testing
./deploy.sh --profile oky-iac-dev
