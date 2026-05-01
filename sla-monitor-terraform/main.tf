terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "remote" {
    organization = "Walids-Labs"
    workspaces {
      name = "Walids-Workspace"
    }
  }
}



provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "sla-monitor"
    }
  }
}


data "aws_caller_identity" "current" {}
data "aws_region" "current" {}


locals {
  account_suffix = substr(data.aws_caller_identity.current.account_id, -8, 8)

  name_prefix = "${var.project_slug}-${var.environment}"

  account_id = data.aws_caller_identity.current.account_id

  region = data.aws_region.current.name
}



module "dynamodb" {
  source = "./modules/dynamodb"

  name_prefix = local.name_prefix
}


module "s3" {
  source = "./modules/s3"

  name_prefix    = local.name_prefix
  account_suffix = local.account_suffix
}


module "iam" {
  source = "./modules/iam"

  name_prefix = local.name_prefix
  account_id  = local.account_id
  region      = local.region


  users_table_arn     = module.dynamodb.users_table_arn
  projects_table_arn  = module.dynamodb.projects_table_arn
  checks_table_arn    = module.dynamodb.checks_table_arn
  incidents_table_arn = module.dynamodb.incidents_table_arn
  reports_table_arn   = module.dynamodb.reports_table_arn


  projects_gsi_arn = module.dynamodb.projects_gsi_arn


  reports_bucket_arn   = module.s3.reports_bucket_arn
  artifacts_bucket_arn = module.s3.artifacts_bucket_arn


  ssm_parameter_prefix = "/sla-monitor/${var.environment}/*"
}
