variable "vpc_cidr" { type = string }
variable "db_instance_class" { type = string }
variable "db_allocated_storage" { type = number }
variable "redis_node_type" { type = string }
variable "mq_instance_type" { type = string }
variable "backend_image" { type = string }
variable "backend_cpu" { type = number }
variable "backend_memory" { type = number }
variable "backend_min_tasks" { type = number }
variable "backend_max_tasks" { type = number }
variable "route53_zone_id" { type = string }
variable "api_domain" { type = string }
variable "admin_domain" { type = string }
variable "api_certificate_arn" { type = string }
variable "admin_certificate_arn_us_east_1" { type = string }
variable "admin_allowed_cidrs" {
  type    = list(string)
  default = []
}
variable "firebase_project_id" { type = string }
variable "alert_emails" { type = list(string) }
