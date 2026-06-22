-- #386 Shoptet integrace — add `shoptet` to ecommerce_platform enum.

ALTER TYPE "ecommerce_platform" ADD VALUE IF NOT EXISTS 'shoptet';
