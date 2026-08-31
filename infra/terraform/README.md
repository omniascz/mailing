# ForgeMsg Infrastructure (Terraform)

AWS-targeted skeleton that lays out the launch infra: VPC, EKS, RDS Postgres,
ElastiCache Redis, S3, and the IAM roles wiring the cluster nodes to the
managed services.

## Layout

```
infra/terraform/
├── envs/
│   ├── staging/        # tfvars + backend config for the staging env
│   └── production/     # tfvars + backend config for prod
├── modules/
│   ├── network/        # VPC, subnets, NAT, IGW
│   ├── eks/            # EKS cluster + managed node groups + addons
│   ├── rds/            # Postgres 16 multi-AZ
│   ├── redis/          # ElastiCache Redis 7 replication group
│   └── object-storage/ # S3 buckets (uploads, exports, deliverability logs)
└── root.tf             # Orchestrates the modules per environment
```

Each env directory holds a `main.tf` that imports the modules with the right
inputs, plus a `backend.tfvars` pointing at the env-specific S3 backend.

## State management

Remote state in S3 + DynamoDB lock table.

```bash
# One-time bootstrap (run by an admin):
aws s3 mb s3://forgemsg-tfstate-eu-central-1 --region eu-central-1
aws s3api put-bucket-versioning --bucket forgemsg-tfstate-eu-central-1 \
  --versioning-configuration Status=Enabled
aws dynamodb create-table --table-name forgemsg-tflock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --region eu-central-1
```

## Day-to-day

```bash
cd infra/terraform/envs/staging
terraform init -backend-config=backend.tfvars
terraform plan -var-file=staging.tfvars
terraform apply -var-file=staging.tfvars
```

Production gates apply behind a manual `gh workflow run` (see
`.github/workflows/infra-apply.yml` — to be added in C#2-followup).

## Module conventions

- Inputs use `snake_case` and validate with `validation` blocks.
- Outputs surface only what neighbours actually need (cluster name, RDS
  endpoint, redis primary endpoint, bucket ARNs).
- Tags are inherited from the env-level `default_tags`.
- All public-facing names are prefixed `forgemsg-${env}-`.

## What this skeleton does NOT do

- Provision AWS Secrets Manager / SSM parameters — those are managed
  out-of-band so secret values never enter Terraform state.
- Set up Route 53 / certificates — the apex domain lives in a separate AWS
  account; this skeleton only outputs LB hostnames.
- Configure Karpenter / cluster-autoscaler / external-dns — those install
  via Helm in the EKS post-bootstrap stage.

<!-- probe: trigger infra-plan.yml to measure what it does without credentials -->
