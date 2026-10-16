#!/bin/sh
set -e
awslocal s3 mb s3://lunchbox-local-handover || true
awslocal s3 mb s3://lunchbox-local-kyc || true
awslocal s3api put-public-access-block --bucket lunchbox-local-handover \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
awslocal s3api put-public-access-block --bucket lunchbox-local-kyc \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
awslocal s3api put-bucket-cors --bucket lunchbox-local-handover --cors-configuration '{"CORSRules":[{"AllowedMethods":["PUT","GET"],"AllowedOrigins":["*"],"AllowedHeaders":["*"]}]}'
awslocal s3api put-bucket-cors --bucket lunchbox-local-kyc --cors-configuration '{"CORSRules":[{"AllowedMethods":["PUT","GET"],"AllowedOrigins":["*"],"AllowedHeaders":["*"]}]}'
echo "LunchBox S3 buckets ready"
