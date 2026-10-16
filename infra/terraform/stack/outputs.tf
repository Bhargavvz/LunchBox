output "ecr_repository_url" { value = module.app.ecr_repository_url }
output "ecs_cluster" { value = module.app.cluster_name }
output "ecs_service" { value = module.app.service_name }
output "admin_bucket" { value = module.edge.admin_bucket }
output "admin_distribution_id" { value = module.edge.admin_distribution_id }
output "alb_dns_name" { value = module.app.alb_dns_name }
output "alerts_topic_arn" { value = module.monitoring.alerts_topic_arn }
output "app_secret_name" { value = aws_secretsmanager_secret.app.name }
