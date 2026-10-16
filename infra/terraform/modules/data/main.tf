terraform {
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.70" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

variable "name" { type = string }
variable "vpc_id" { type = string }
variable "data_subnet_ids" { type = list(string) }
variable "app_security_group_id" { type = string }
variable "kms_key_arn" { type = string }
variable "db_instance_class" { type = string }
variable "db_allocated_storage" { type = number }
variable "multi_az" { type = bool }
variable "create_read_replica" { type = bool }
variable "redis_node_type" { type = string }
variable "redis_replicas" { type = number }
variable "mq_instance_type" { type = string }
variable "mq_deployment_mode" {
  type        = string
  description = "SINGLE_INSTANCE (dev) or CLUSTER_MULTI_AZ (prod)."
}
variable "deletion_protection" { type = bool }

# ---------- PostgreSQL 16 + PostGIS (RDS) ----------

resource "aws_security_group" "db" {
  name   = "${var.name}-db"
  vpc_id = var.vpc_id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
  }
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db"
  subnet_ids = var.data_subnet_ids
}

resource "aws_db_parameter_group" "pg16" {
  name   = "${var.name}-pg16"
  family = "postgres16"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_min_duration_statement"
    value = "500"
  }
  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements"
    apply_method = "pending-reboot"
  }
}

resource "aws_db_instance" "primary" {
  identifier                            = "${var.name}-pg"
  engine                                = "postgres"
  engine_version                        = "16.4"
  instance_class                        = var.db_instance_class
  allocated_storage                     = var.db_allocated_storage
  max_allocated_storage                 = var.db_allocated_storage * 4
  storage_type                          = "gp3"
  storage_encrypted                     = true
  kms_key_id                            = var.kms_key_arn
  db_name                               = "lunchbox"
  username                              = "lunchbox"
  manage_master_user_password           = true
  master_user_secret_kms_key_id         = var.kms_key_arn
  multi_az                              = var.multi_az
  db_subnet_group_name                  = aws_db_subnet_group.this.name
  vpc_security_group_ids                = [aws_security_group.db.id]
  parameter_group_name                  = aws_db_parameter_group.pg16.name
  backup_retention_period               = 14
  backup_window                         = "20:00-21:00" # 01:30–02:30 IST
  maintenance_window                    = "sun:21:30-sun:22:30"
  performance_insights_enabled          = true
  performance_insights_kms_key_id       = var.kms_key_arn
  monitoring_interval                   = 60
  monitoring_role_arn                   = aws_iam_role.rds_monitoring.arn
  enabled_cloudwatch_logs_exports       = ["postgresql"]
  deletion_protection                   = var.deletion_protection
  skip_final_snapshot                   = !var.deletion_protection
  final_snapshot_identifier             = var.deletion_protection ? "${var.name}-pg-final" : null
  auto_minor_version_upgrade            = true
  copy_tags_to_snapshot                 = true
  iam_database_authentication_enabled   = true
}

# Read replica serving admin reports.
resource "aws_db_instance" "replica" {
  count                        = var.create_read_replica ? 1 : 0
  identifier                   = "${var.name}-pg-replica"
  replicate_source_db          = aws_db_instance.primary.identifier
  instance_class               = var.db_instance_class
  storage_encrypted            = true
  kms_key_id                   = var.kms_key_arn
  vpc_security_group_ids       = [aws_security_group.db.id]
  parameter_group_name         = aws_db_parameter_group.pg16.name
  performance_insights_enabled = true
  performance_insights_kms_key_id = var.kms_key_arn
  skip_final_snapshot          = true
  auto_minor_version_upgrade   = true
}

resource "aws_iam_role" "rds_monitoring" {
  name = "${var.name}-rds-monitoring"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "monitoring.rds.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# ---------- Redis (ElastiCache) ----------

resource "aws_security_group" "redis" {
  name   = "${var.name}-redis"
  vpc_id = var.vpc_id
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
  }
}

resource "aws_elasticache_subnet_group" "this" {
  name       = "${var.name}-redis"
  subnet_ids = var.data_subnet_ids
}

resource "random_password" "redis" {
  length  = 48
  special = false
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id       = "${var.name}-redis"
  description                = "LunchBox cache, live locations, rate limits, locks"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.redis_node_type
  num_cache_clusters         = 1 + var.redis_replicas
  automatic_failover_enabled = var.redis_replicas > 0
  multi_az_enabled           = var.redis_replicas > 0
  subnet_group_name          = aws_elasticache_subnet_group.this.name
  security_group_ids         = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  kms_key_id                 = var.kms_key_arn
  transit_encryption_enabled = true
  auth_token                 = random_password.redis.result
  snapshot_retention_limit   = 3
  port                       = 6379
}

# ---------- Amazon MQ for RabbitMQ (AMQP + STOMP relay) ----------

resource "aws_security_group" "mq" {
  name   = "${var.name}-mq"
  vpc_id = var.vpc_id
  ingress {
    description     = "AMQPS"
    from_port       = 5671
    to_port         = 5671
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
  }
  ingress {
    description     = "STOMP over TLS"
    from_port       = 61614
    to_port         = 61614
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
  }
}

resource "random_password" "mq" {
  length  = 32
  special = false
}

resource "aws_mq_broker" "this" {
  broker_name                = "${var.name}-rabbit"
  engine_type                = "RabbitMQ"
  engine_version             = "3.13"
  host_instance_type         = var.mq_instance_type
  deployment_mode            = var.mq_deployment_mode
  publicly_accessible        = false
  subnet_ids                 = var.mq_deployment_mode == "SINGLE_INSTANCE" ? [var.data_subnet_ids[0]] : var.data_subnet_ids
  security_groups            = [aws_security_group.mq.id]
  auto_minor_version_upgrade = true
  encryption_options {
    use_aws_owned_key = false
    kms_key_id        = var.kms_key_arn
  }
  logs {
    general = true
  }
  user {
    username = "lunchbox"
    password = random_password.mq.result
  }
  maintenance_window_start_time {
    day_of_week = "SUNDAY"
    time_of_day = "21:00"
    time_zone   = "UTC"
  }
}

output "db_endpoint" { value = aws_db_instance.primary.address }
output "db_replica_endpoint" { value = var.create_read_replica ? aws_db_instance.replica[0].address : aws_db_instance.primary.address }
output "db_master_secret_arn" { value = aws_db_instance.primary.master_user_secret[0].secret_arn }
output "db_instance_id" { value = aws_db_instance.primary.identifier }
output "redis_endpoint" { value = aws_elasticache_replication_group.this.primary_endpoint_address }
output "redis_auth_token" {
  value     = random_password.redis.result
  sensitive = true
}
output "redis_group_id" { value = aws_elasticache_replication_group.this.id }
output "mq_endpoint_host" { value = replace(replace(aws_mq_broker.this.instances[0].endpoints[0], "amqps://", ""), ":5671", "") }
output "mq_password" {
  value     = random_password.mq.result
  sensitive = true
}
output "mq_broker_id" { value = aws_mq_broker.this.id }
