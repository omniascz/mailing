terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.50" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  backend "s3" {}
}

provider "aws" {
  region = var.region
  default_tags {
    tags = merge(var.default_tags, { Environment = "production" })
  }
}

variable "region" {
  type    = string
  default = "eu-central-1"
}

variable "azs" {
  type    = list(string)
  default = ["eu-central-1a", "eu-central-1b", "eu-central-1c"]
}

variable "default_tags" {
  type = map(string)
  default = {
    Project   = "forgemsg"
    ManagedBy = "terraform"
  }
}

locals {
  name = "forgemsg-prod"
}

module "network" {
  source = "../../modules/network"
  name   = local.name
  cidr   = "10.10.0.0/16"
  azs    = var.azs
}

module "eks" {
  source              = "../../modules/eks"
  name                = local.name
  kubernetes_version  = "1.30"
  subnet_ids          = module.network.private_subnet_ids
  node_groups = {
    api = {
      instance_types = ["m6i.xlarge"]
      desired        = 3
      min            = 3
      max            = 12
      labels         = { workload = "api" }
    }
    workers = {
      instance_types = ["m6i.xlarge"]
      desired        = 3
      min            = 3
      max            = 20
      labels         = { workload = "workers" }
    }
  }
}

module "rds" {
  source               = "../../modules/rds"
  name                 = "${local.name}-pg"
  subnet_ids           = module.network.private_subnet_ids
  vpc_id               = module.network.vpc_id
  vpc_cidr             = module.network.vpc_cidr
  instance_class       = "db.m6g.xlarge"
  allocated_storage_gb = 500
  multi_az             = true
  deletion_protection  = true
}

module "redis" {
  source       = "../../modules/redis"
  name         = "${local.name}-redis"
  subnet_ids   = module.network.private_subnet_ids
  vpc_id       = module.network.vpc_id
  vpc_cidr     = module.network.vpc_cidr
  node_type    = "cache.m6g.large"
  num_replicas = 1
}

module "storage" {
  source      = "../../modules/object-storage"
  name_prefix = local.name
}

output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "rds_endpoint" {
  value = module.rds.endpoint
}

output "redis_endpoint" {
  value = module.redis.primary_endpoint
}

output "s3_buckets" {
  value = module.storage.bucket_names
}
