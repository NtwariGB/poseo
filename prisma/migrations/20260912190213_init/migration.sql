-- CreateEnum
CREATE TYPE "composition_rule_kind" AS ENUM ('REQUIRE', 'OFFER', 'FORBID', 'SURCHARGE');

-- CreateEnum
CREATE TYPE "composition_status" AS ENUM ('DRAFT', 'QUOTED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "service_operation_origin" AS ENUM ('MANDATORY', 'OPTIONAL');

-- CreateEnum
CREATE TYPE "quote_status" AS ENUM ('ISSUED', 'ACCEPTED', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "quote_line_kind" AS ENUM ('OPERATION', 'SURCHARGE');

-- CreateTable
CREATE TABLE "tenant" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "vat_rate_bp" INTEGER NOT NULL,
    "quote_validity_days" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_type" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "reference_duration_minutes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_postal_code" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "postal_code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zone_postal_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labor_rate" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "hourly_rate_cents" INTEGER NOT NULL,
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "labor_rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "constraint_type" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "constraint_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "composition_rule" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_type_id" UUID NOT NULL,
    "constraint_type_id" UUID,
    "kind" "composition_rule_kind" NOT NULL,
    "operation_id" UUID,
    "label" TEXT,
    "surcharge_percent_bp" INTEGER,
    "surcharge_cents" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "composition_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_composition" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_type_id" UUID NOT NULL,
    "product_ref" TEXT NOT NULL,
    "address_line" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "status" "composition_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_composition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_constraint" (
    "id" UUID NOT NULL,
    "composition_id" UUID NOT NULL,
    "constraint_type_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_constraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_operation" (
    "id" UUID NOT NULL,
    "composition_id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "origin" "service_operation_origin" NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "composition_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "quote_status" NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL,
    "valid_until" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "zone_code" TEXT NOT NULL,
    "hourly_rate_cents" INTEGER NOT NULL,
    "product_type_label" TEXT NOT NULL,
    "labor_cents" INTEGER NOT NULL,
    "surcharge_cents" INTEGER NOT NULL,
    "subtotal_cents" INTEGER NOT NULL,
    "vat_rate_bp" INTEGER NOT NULL,
    "vat_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_line" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "quote_line_kind" NOT NULL,
    "label" TEXT NOT NULL,
    "duration_minutes" INTEGER,
    "hourly_rate_cents" INTEGER,
    "amount_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_counter" (
    "tenant_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_counter_pkey" PRIMARY KEY ("tenant_id","year")
);

-- CreateTable
CREATE TABLE "outbox_event" (
    "id" UUID NOT NULL,
    "aggregatetype" TEXT NOT NULL,
    "aggregateid" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_code_key" ON "tenant"("code");

-- CreateIndex
CREATE UNIQUE INDEX "product_type_tenant_id_code_key" ON "product_type"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "operation_tenant_id_code_key" ON "operation"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "zone_tenant_id_code_key" ON "zone"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "zone_postal_code_tenant_id_postal_code_key" ON "zone_postal_code"("tenant_id", "postal_code");

-- CreateIndex
CREATE UNIQUE INDEX "labor_rate_zone_id_valid_from_key" ON "labor_rate"("zone_id", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "constraint_type_tenant_id_code_key" ON "constraint_type"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "service_composition_tenant_id_status_idx" ON "service_composition"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "service_constraint_composition_id_constraint_type_id_key" ON "service_constraint"("composition_id", "constraint_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_operation_composition_id_operation_id_key" ON "service_operation"("composition_id", "operation_id");

-- CreateIndex
CREATE INDEX "quote_status_valid_until_idx" ON "quote"("status", "valid_until");

-- CreateIndex
CREATE UNIQUE INDEX "quote_tenant_id_number_key" ON "quote"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "quote_line_quote_id_position_key" ON "quote_line"("quote_id", "position");

-- AddForeignKey
ALTER TABLE "product_type" ADD CONSTRAINT "product_type_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation" ADD CONSTRAINT "operation_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone" ADD CONSTRAINT "zone_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_postal_code" ADD CONSTRAINT "zone_postal_code_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_postal_code" ADD CONSTRAINT "zone_postal_code_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labor_rate" ADD CONSTRAINT "labor_rate_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labor_rate" ADD CONSTRAINT "labor_rate_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "constraint_type" ADD CONSTRAINT "constraint_type_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composition_rule" ADD CONSTRAINT "composition_rule_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composition_rule" ADD CONSTRAINT "composition_rule_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "product_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composition_rule" ADD CONSTRAINT "composition_rule_constraint_type_id_fkey" FOREIGN KEY ("constraint_type_id") REFERENCES "constraint_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composition_rule" ADD CONSTRAINT "composition_rule_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "operation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_composition" ADD CONSTRAINT "service_composition_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_composition" ADD CONSTRAINT "service_composition_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "product_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_constraint" ADD CONSTRAINT "service_constraint_composition_id_fkey" FOREIGN KEY ("composition_id") REFERENCES "service_composition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_constraint" ADD CONSTRAINT "service_constraint_constraint_type_id_fkey" FOREIGN KEY ("constraint_type_id") REFERENCES "constraint_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_operation" ADD CONSTRAINT "service_operation_composition_id_fkey" FOREIGN KEY ("composition_id") REFERENCES "service_composition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_operation" ADD CONSTRAINT "service_operation_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "operation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_composition_id_fkey" FOREIGN KEY ("composition_id") REFERENCES "service_composition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_counter" ADD CONSTRAINT "quote_counter_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Contraintes non exprimables dans le schéma Prisma (voir DECISIONS.md, 2026-09-12)
-- ---------------------------------------------------------------------------

-- Au plus un devis ISSUED et au plus un devis ACCEPTED par prestation
CREATE UNIQUE INDEX "quote_one_issued_per_composition"
  ON "quote" ("composition_id") WHERE "status" = 'ISSUED';

CREATE UNIQUE INDEX "quote_one_accepted_per_composition"
  ON "quote" ("composition_id") WHERE "status" = 'ACCEPTED';

-- CompositionRule : operation_id obligatoire pour REQUIRE/OFFER/FORBID, interdit pour SURCHARGE
ALTER TABLE "composition_rule" ADD CONSTRAINT "composition_rule_operation_by_kind"
  CHECK (
    ("kind" = 'SURCHARGE' AND "operation_id" IS NULL)
    OR ("kind" <> 'SURCHARGE' AND "operation_id" IS NOT NULL)
  );

-- CompositionRule : SURCHARGE porte exactement un des deux montants, les autres genres aucun
ALTER TABLE "composition_rule" ADD CONSTRAINT "composition_rule_surcharge_amount"
  CHECK (
    ("kind" = 'SURCHARGE'
      AND (("surcharge_percent_bp" IS NOT NULL)::int + ("surcharge_cents" IS NOT NULL)::int) = 1)
    OR ("kind" <> 'SURCHARGE'
      AND "surcharge_percent_bp" IS NULL AND "surcharge_cents" IS NULL)
  );