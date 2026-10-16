variable "environment" {
  type = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging or prod"
  }
}
variable "region" {
  type    = string
  default = "ap-south-1"
}
variable "vpc_cidr" { type = string }
variable "azs" {
  type    = list(string)
  default = ["ap-south-1a", "ap-south-1b", "ap-south-1c"]
}
variable "db_instance_class" { type = string }
variable "db_allocated_storage" { type = number }
variable "redis_node_type" { type = string }
variable "mq_instance_type" { type = string }
variable "backend_image" {
  type        = string
  description = "Full ECR image reference, e.g. <acct>.dkr.ecr.ap-south-1.amazonaws.com/lunchbox-prod/backend:<sha>"
}
variable "backend_cpu" { type = number }
variable "backend_memory" { type = number }
variable "backend_min_tasks" { type = number }
variable "backend_max_tasks" { type = number }
variable "route53_zone_id" { type = string }
variable "api_domain" { type = string }
variable "admin_domain" { type = string }
variable "api_certificate_arn" {
  type        = string
  description = "ACM certificate in ap-south-1 for the API domain"
}
variable "admin_certificate_arn_us_east_1" {
  type        = string
  description = "ACM certificate in us-east-1 (CloudFront requirement) for the admin domain"
}
variable "admin_allowed_cidrs" {
  type    = list(string)
  default = []
}
variable "firebase_project_id" { type = string }
variable "otlp_endpoint" {
  type    = string
  default = "http://localhost:4318/v1/traces"
}
variable "alert_emails" { type = list(string) }
