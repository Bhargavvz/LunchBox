terraform {
  required_version = ">= 1.6.0"
  backend "s3" {
    bucket         = "lunchbox-terraform-state"
    key            = "dev/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "lunchbox-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = "ap-south-1"
  default_tags {
    tags = { Project = "lunchbox", Environment = "dev", ManagedBy = "terraform" }
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = { Project = "lunchbox", Environment = "dev", ManagedBy = "terraform" }
  }
}

module "stack" {
  source = "../../stack"
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }
  environment                     = "dev"
  vpc_cidr                        = var.vpc_cidr
  db_instance_class               = var.db_instance_class
  db_allocated_storage            = var.db_allocated_storage
  redis_node_type                 = var.redis_node_type
  mq_instance_type                = var.mq_instance_type
  backend_image                   = var.backend_image
  backend_cpu                     = var.backend_cpu
  backend_memory                  = var.backend_memory
  backend_min_tasks               = var.backend_min_tasks
  backend_max_tasks               = var.backend_max_tasks
  route53_zone_id                 = var.route53_zone_id
  api_domain                      = var.api_domain
  admin_domain                    = var.admin_domain
  api_certificate_arn             = var.api_certificate_arn
  admin_certificate_arn_us_east_1 = var.admin_certificate_arn_us_east_1
  admin_allowed_cidrs             = var.admin_allowed_cidrs
  firebase_project_id             = var.firebase_project_id
  alert_emails                    = var.alert_emails
}

output "stack" { value = module.stack }
