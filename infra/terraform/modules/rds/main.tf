terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.50" }
  }
}

variable "name" { type = string }
variable "subnet_ids" { type = list(string) }
variable "vpc_id" { type = string }
variable "vpc_cidr" { type = string }

variable "instance_class" {
  type    = string
  default = "db.m6g.large"
}

variable "allocated_storage_gb" {
  type    = number
  default = 100
}

variable "multi_az" {
  type    = bool
  default = true
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "tags" {
  type    = map(string)
  default = {}
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db-subnets"
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

resource "aws_security_group" "db" {
  name        = "${var.name}-db"
  vpc_id      = var.vpc_id
  description = "Postgres ingress from VPC only."

  ingress {
    description = "Postgres from VPC"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}

resource "random_password" "master" {
  length  = 32
  special = true
  # RDS doesn't allow these in master passwords:
  override_special = "!#$%&*()-_=+[]{}<>?"
}

resource "aws_db_instance" "this" {
  identifier              = var.name
  engine                  = "postgres"
  engine_version          = "16"
  instance_class          = var.instance_class
  allocated_storage       = var.allocated_storage_gb
  storage_type            = "gp3"
  storage_encrypted       = true
  db_name                 = "forgemsg"
  username                = "forgemsg_admin"
  password                = random_password.master.result
  multi_az                = var.multi_az
  vpc_security_group_ids  = [aws_security_group.db.id]
  db_subnet_group_name    = aws_db_subnet_group.this.name
  backup_retention_period = 14
  deletion_protection     = var.deletion_protection
  skip_final_snapshot     = !var.deletion_protection
  performance_insights_enabled = true
  parameter_group_name    = aws_db_parameter_group.this.name

  tags = var.tags
}

resource "aws_db_parameter_group" "this" {
  name   = "${var.name}-pg16"
  family = "postgres16"

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
    apply_method = "pending-reboot"
  }
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  tags = var.tags
}

output "endpoint" {
  value = aws_db_instance.this.endpoint
}

output "port" {
  value = aws_db_instance.this.port
}

output "db_name" {
  value = aws_db_instance.this.db_name
}

output "master_password_secret" {
  value = random_password.master.result
  sensitive = true
}

output "security_group_id" {
  value = aws_security_group.db.id
}
