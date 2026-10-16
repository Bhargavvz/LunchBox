terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.70", configuration_aliases = [aws.us_east_1] }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

# Composition shared by dev, staging and prod; environments differ only in variables.

module "network" {
  source             = "../modules/network"
  name               = local.name
  cidr               = var.vpc_cidr
  azs                = var.azs
  single_nat_gateway = var.environment != "prod"
}

resource "aws_security_group" "alb" {
  name   = "${local.name}-alb"
  vpc_id = module.network.vpc_id
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = [module.network.vpc_cidr]
  }
}

resource "aws_security_group" "app" {
  name   = "${local.name}-app"
  vpc_id = module.network.vpc_id
  ingress {
    description     = "ALB to backend"
    from_port       = 8080
    to_port         = 8080
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    description = "Outbound (data stores in VPC; third-party APIs via NAT)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ---------- IAM ----------

resource "aws_iam_role" "task" {
  name = "${local.name}-task"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role" "execution" {
  name = "${local.name}-execution"
  assume_role_policy = aws_iam_role.task.assume_role_policy
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = [aws_secretsmanager_secret.app.arn, module.data.db_master_secret_arn] },
      { Effect = "Allow", Action = ["kms:Decrypt"], Resource = [module.storage.kms_key_arn] }
    ]
  })
}

resource "aws_iam_role_policy" "task" {
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = [for arn in module.storage.bucket_arns : "${arn}/*"]
      },
      { Effect = "Allow", Action = ["kms:GenerateDataKey", "kms:Decrypt"], Resource = [module.storage.kms_key_arn] },
      { Effect = "Allow", Action = ["cloudwatch:PutMetricData"], Resource = "*" }
    ]
  })
}

# ---------- Storage, data, secrets ----------

module "storage" {
  source            = "../modules/storage"
  name              = local.name
  app_task_role_arn = aws_iam_role.task.arn
  upload_origins    = ["https://${var.admin_domain}", "capacitor://localhost", "http://localhost"]
}

module "data" {
  source                = "../modules/data"
  name                  = local.name
  vpc_id                = module.network.vpc_id
  data_subnet_ids       = module.network.data_subnet_ids
  app_security_group_id = aws_security_group.app.id
  kms_key_arn           = module.storage.kms_key_arn
  db_instance_class     = var.db_instance_class
  db_allocated_storage  = var.db_allocated_storage
  multi_az              = var.environment == "prod"
  create_read_replica   = var.environment != "dev"
  redis_node_type       = var.redis_node_type
  redis_replicas        = var.environment == "prod" ? 1 : 0
  mq_instance_type      = var.mq_instance_type
  mq_deployment_mode    = var.environment == "prod" ? "CLUSTER_MULTI_AZ" : "SINGLE_INSTANCE"
  deletion_protection   = var.environment == "prod"
}

# Application secrets. Values are set out-of-band (console/CLI), never in Terraform state:
# PII_KEY, QR_SIGNING_KEY, FIREBASE_CREDENTIALS_JSON, RAZORPAY_*, RAZORPAYX_*, MSG91_*, EXOTEL_*, IDFY_*, SENTRY_DSN.
resource "aws_secretsmanager_secret" "app" {
  name       = "${local.name}/app"
  kms_key_id = module.storage.kms_key_arn
}

resource "aws_secretsmanager_secret" "infra" {
  name       = "${local.name}/infra"
  kms_key_id = module.storage.kms_key_arn
}

resource "aws_secretsmanager_secret_version" "infra" {
  secret_id = aws_secretsmanager_secret.infra.id
  secret_string = jsonencode({
    REDIS_PASSWORD = module.data.redis_auth_token
    RABBIT_PASSWORD = module.data.mq_password
  })
}

resource "aws_iam_role_policy" "execution_infra_secret" {
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = [aws_secretsmanager_secret.infra.arn] }]
  })
}

locals {
  name = "lunchbox-${var.environment}"
  app_secret_keys = [
    "LUNCHBOX_PII_KEY", "LUNCHBOX_QR_SIGNING_KEY", "FIREBASE_CREDENTIALS_JSON",
    "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    "RAZORPAYX_KEY_ID", "RAZORPAYX_KEY_SECRET", "RAZORPAYX_ACCOUNT_NUMBER", "RAZORPAYX_WEBHOOK_SECRET",
    "MSG91_AUTH_KEY", "MSG91_TPL_ORDER_PICKED_UP", "MSG91_TPL_ORDER_DELIVERED", "MSG91_TPL_ORDER_DELIVERY_FAILED",
    "MSG91_TPL_PARTNER_ARRIVING", "MSG91_TPL_PICKUP_FAILED",
    "EXOTEL_SID", "EXOTEL_API_KEY", "EXOTEL_API_TOKEN", "EXOTEL_CALLER_ID",
    "IDFY_ACCOUNT_ID", "IDFY_API_KEY", "SENTRY_DSN",
  ]
}

module "app" {
  source                = "../modules/app"
  name                  = local.name
  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  private_subnet_ids    = module.network.private_subnet_ids
  alb_security_group_id = aws_security_group.alb.id
  app_security_group_id = aws_security_group.app.id
  task_role_arn         = aws_iam_role.task.arn
  execution_role_arn    = aws_iam_role.execution.arn
  certificate_arn       = var.api_certificate_arn
  image                 = var.backend_image
  cpu                   = var.backend_cpu
  memory                = var.backend_memory
  desired_count         = var.backend_min_tasks
  max_count             = var.backend_max_tasks
  environment = {
    SPRING_PROFILES_ACTIVE = "prod"
    AWS_REGION             = var.region
    DB_URL                 = "jdbc:postgresql://${module.data.db_endpoint}:5432/lunchbox?sslmode=require"
    DB_REPLICA_URL         = "jdbc:postgresql://${module.data.db_replica_endpoint}:5432/lunchbox?sslmode=require"
    REDIS_HOST             = module.data.redis_endpoint
    REDIS_SSL              = "true"
    RABBIT_HOST            = module.data.mq_endpoint_host
    RABBIT_PORT            = "5671"
    RABBIT_SSL             = "true"
    RABBIT_USERNAME        = "lunchbox"
    STOMP_RELAY_HOST       = module.data.mq_endpoint_host
    STOMP_RELAY_PORT       = "61614"
    STOMP_RELAY_SSL        = "true"
    STOMP_CLIENT_LOGIN     = "lunchbox"
    STOMP_SYSTEM_LOGIN     = "lunchbox"
    STOMP_ALLOWED_ORIGINS  = "https://${var.admin_domain}"
    CORS_ALLOWED_ORIGINS   = "https://${var.admin_domain}"
    S3_HANDOVER_BUCKET     = module.storage.handover_bucket
    S3_KYC_BUCKET          = module.storage.kyc_bucket
    S3_KMS_KEY_ID          = module.storage.kms_key_id
    GOOGLE_CLOUD_PROJECT   = var.firebase_project_id
    TRACING_SAMPLING       = var.environment == "prod" ? "0.05" : "0.2"
    OTLP_TRACES_ENDPOINT   = var.otlp_endpoint
    JAVA_TOOL_OPTIONS      = "-XX:MaxRAMPercentage=75"
  }
  secrets = merge(
    { for k in local.app_secret_keys : k => "${aws_secretsmanager_secret.app.arn}:${k}::" },
    {
      DB_USERNAME           = "${module.data.db_master_secret_arn}:username::"
      DB_PASSWORD           = "${module.data.db_master_secret_arn}:password::"
      DB_REPLICA_USERNAME   = "${module.data.db_master_secret_arn}:username::"
      DB_REPLICA_PASSWORD   = "${module.data.db_master_secret_arn}:password::"
      REDIS_PASSWORD        = "${aws_secretsmanager_secret.infra.arn}:REDIS_PASSWORD::"
      RABBIT_PASSWORD       = "${aws_secretsmanager_secret.infra.arn}:RABBIT_PASSWORD::"
      STOMP_CLIENT_PASSCODE = "${aws_secretsmanager_secret.infra.arn}:RABBIT_PASSWORD::"
      STOMP_SYSTEM_PASSCODE = "${aws_secretsmanager_secret.infra.arn}:RABBIT_PASSWORD::"
    }
  )
}

module "edge" {
  source = "../modules/edge"
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }
  name                     = local.name
  zone_id                  = var.route53_zone_id
  api_domain               = var.api_domain
  admin_domain             = var.admin_domain
  alb_arn                  = module.app.alb_arn
  alb_dns_name             = module.app.alb_dns_name
  alb_zone_id              = module.app.alb_zone_id
  admin_cert_arn_us_east_1 = var.admin_certificate_arn_us_east_1
  admin_allowed_cidrs      = var.admin_allowed_cidrs
}

module "monitoring" {
  source                  = "../modules/monitoring"
  name                    = local.name
  alert_emails            = var.alert_emails
  alb_arn_suffix          = module.app.alb_arn_suffix
  target_group_arn_suffix = module.app.target_group_arn_suffix
  cluster_name            = module.app.cluster_name
  service_name            = module.app.service_name
  db_instance_id          = module.data.db_instance_id
  redis_group_id          = module.data.redis_group_id
  mq_broker_name          = "${local.name}-rabbit"
  log_group_name          = module.app.log_group_name
}
