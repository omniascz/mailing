terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.50" }
  }
}

variable "name" {
  type = string
}

variable "kubernetes_version" {
  type    = string
  default = "1.30"
}

variable "subnet_ids" {
  type        = list(string)
  description = "Private subnets where the cluster ENIs and node groups live."
}

variable "node_groups" {
  description = "Managed node group spec; instance type, scaling and labels."
  type = map(object({
    instance_types = list(string)
    desired        = number
    min            = number
    max            = number
    labels         = optional(map(string), {})
  }))
  default = {
    api = {
      instance_types = ["m6i.large"]
      desired        = 2
      min            = 2
      max            = 6
      labels         = { workload = "api" }
    }
    workers = {
      instance_types = ["m6i.large"]
      desired        = 2
      min            = 2
      max            = 10
      labels         = { workload = "workers" }
    }
  }
}

variable "tags" {
  type    = map(string)
  default = {}
}

# ─── IAM ──────────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "cluster_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "cluster" {
  name               = "${var.name}-cluster"
  assume_role_policy = data.aws_iam_policy_document.cluster_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "cluster_amazon_eks" {
  role       = aws_iam_role.cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

data "aws_iam_policy_document" "node_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "node" {
  name               = "${var.name}-node"
  assume_role_policy = data.aws_iam_policy_document.node_assume.json
  tags               = var.tags
}

locals {
  node_managed_policies = [
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
  ]
}

resource "aws_iam_role_policy_attachment" "node_managed" {
  for_each   = toset(local.node_managed_policies)
  role       = aws_iam_role.node.name
  policy_arn = each.value
}

# ─── Cluster ──────────────────────────────────────────────────────────────────

resource "aws_eks_cluster" "this" {
  name     = var.name
  role_arn = aws_iam_role.cluster.arn
  version  = var.kubernetes_version

  vpc_config {
    subnet_ids              = var.subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = true
  }

  # Default access config: API + ConfigMap so existing tooling (kubectl, helm)
  # using IAM principals works out-of-the-box.
  access_config {
    authentication_mode = "API_AND_CONFIG_MAP"
  }

  tags = var.tags

  depends_on = [aws_iam_role_policy_attachment.cluster_amazon_eks]
}

resource "aws_eks_node_group" "this" {
  for_each        = var.node_groups
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = each.key
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = var.subnet_ids
  instance_types  = each.value.instance_types
  labels          = each.value.labels

  scaling_config {
    desired_size = each.value.desired
    min_size     = each.value.min
    max_size     = each.value.max
  }

  update_config {
    max_unavailable_percentage = 33
  }

  tags = merge(var.tags, { "kubernetes.io/cluster/${var.name}" = "owned" })

  depends_on = [aws_iam_role_policy_attachment.node_managed]
}

output "cluster_name" {
  value = aws_eks_cluster.this.name
}

output "cluster_endpoint" {
  value = aws_eks_cluster.this.endpoint
}

output "cluster_ca" {
  value     = aws_eks_cluster.this.certificate_authority[0].data
  sensitive = true
}

output "oidc_issuer_url" {
  value = aws_eks_cluster.this.identity[0].oidc[0].issuer
}
