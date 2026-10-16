terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.70" }
  }
}

variable "name" { type = string }
variable "alert_emails" { type = list(string) }
variable "alb_arn_suffix" { type = string }
variable "target_group_arn_suffix" { type = string }
variable "cluster_name" { type = string }
variable "service_name" { type = string }
variable "db_instance_id" { type = string }
variable "redis_group_id" { type = string }
variable "mq_broker_name" { type = string }
variable "log_group_name" { type = string }

resource "aws_sns_topic" "alerts" {
  name = "${var.name}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  for_each  = toset(var.alert_emails)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

locals {
  alarms = {
    "api-5xx" = {
      namespace = "AWS/ApplicationELB", metric = "HTTPCode_Target_5XX_Count", stat = "Sum", threshold = 25, period = 300,
      dimensions = { LoadBalancer = var.alb_arn_suffix, TargetGroup = var.target_group_arn_suffix }, comparison = "GreaterThanThreshold"
      description = "Backend 5xx responses above 25 in 5 minutes"
    }
    "api-p95-latency" = {
      namespace = "AWS/ApplicationELB", metric = "TargetResponseTime", stat = "p95", threshold = 0.3, period = 300,
      dimensions = { LoadBalancer = var.alb_arn_suffix, TargetGroup = var.target_group_arn_suffix }, comparison = "GreaterThanThreshold"
      description = "API p95 latency above the 300 ms target"
    }
    "unhealthy-targets" = {
      namespace = "AWS/ApplicationELB", metric = "UnHealthyHostCount", stat = "Maximum", threshold = 0, period = 60,
      dimensions = { LoadBalancer = var.alb_arn_suffix, TargetGroup = var.target_group_arn_suffix }, comparison = "GreaterThanThreshold"
      description = "At least one backend task failing health checks"
    }
    "ecs-cpu" = {
      namespace = "AWS/ECS", metric = "CPUUtilization", stat = "Average", threshold = 85, period = 300,
      dimensions = { ClusterName = var.cluster_name, ServiceName = var.service_name }, comparison = "GreaterThanThreshold"
      description = "Backend CPU above 85%"
    }
    "rds-cpu" = {
      namespace = "AWS/RDS", metric = "CPUUtilization", stat = "Average", threshold = 80, period = 300,
      dimensions = { DBInstanceIdentifier = var.db_instance_id }, comparison = "GreaterThanThreshold"
      description = "Postgres CPU above 80%"
    }
    "rds-free-storage" = {
      namespace = "AWS/RDS", metric = "FreeStorageSpace", stat = "Minimum", threshold = 10737418240, period = 300,
      dimensions = { DBInstanceIdentifier = var.db_instance_id }, comparison = "LessThanThreshold"
      description = "Postgres free storage below 10 GiB"
    }
    "redis-memory" = {
      namespace = "AWS/ElastiCache", metric = "DatabaseMemoryUsagePercentage", stat = "Maximum", threshold = 80, period = 300,
      dimensions = { ReplicationGroupId = var.redis_group_id }, comparison = "GreaterThanThreshold"
      description = "Redis memory above 80%"
    }
    "mq-queue-depth" = {
      namespace = "AWS/AmazonMQ", metric = "MessageCount", stat = "Maximum", threshold = 5000, period = 300,
      dimensions = { Broker = var.mq_broker_name }, comparison = "GreaterThanThreshold"
      description = "RabbitMQ backlog above 5000 messages (consumers falling behind)"
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "this" {
  for_each            = local.alarms
  alarm_name          = "${var.name}-${each.key}"
  alarm_description   = each.value.description
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  extended_statistic  = startswith(each.value.stat, "p") ? each.value.stat : null
  statistic           = startswith(each.value.stat, "p") ? null : each.value.stat
  period              = each.value.period
  evaluation_periods  = 2
  threshold           = each.value.threshold
  comparison_operator = each.value.comparison
  dimensions          = each.value.dimensions
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# Application-level signals extracted from structured logs.
resource "aws_cloudwatch_log_metric_filter" "delivery_failed" {
  name           = "${var.name}-delivery-failed"
  log_group_name = var.log_group_name
  pattern        = "\"-> DELIVERY_FAILED\""
  metric_transformation {
    name      = "DeliveryFailed"
    namespace = "LunchBox"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "delivery_failed" {
  alarm_name          = "${var.name}-delivery-failures"
  alarm_description   = "Three or more failed deliveries within 15 minutes"
  namespace           = "LunchBox"
  metric_name         = "DeliveryFailed"
  statistic           = "Sum"
  period              = 900
  evaluation_periods  = 1
  threshold           = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_log_metric_filter" "outbox_failures" {
  name           = "${var.name}-outbox-failed"
  log_group_name = var.log_group_name
  pattern        = "\"Outbox publish failed\""
  metric_transformation {
    name      = "OutboxPublishFailed"
    namespace = "LunchBox"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "outbox_failures" {
  alarm_name          = "${var.name}-outbox-failures"
  alarm_description   = "Domain events are not reaching RabbitMQ"
  namespace           = "LunchBox"
  metric_name         = "OutboxPublishFailed"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

output "alerts_topic_arn" { value = aws_sns_topic.alerts.arn }
