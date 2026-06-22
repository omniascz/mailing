-- #390/#392 — add Upgates and FastCentrik to ecommerce_platform enum.

ALTER TYPE "ecommerce_platform" ADD VALUE IF NOT EXISTS 'upgates';
ALTER TYPE "ecommerce_platform" ADD VALUE IF NOT EXISTS 'fastcentrik';
