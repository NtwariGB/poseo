-- DropForeignKey
ALTER TABLE "composition_rule" DROP CONSTRAINT "composition_rule_constraint_type_id_fkey";

-- DropForeignKey
ALTER TABLE "composition_rule" DROP CONSTRAINT "composition_rule_operation_id_fkey";

-- AddForeignKey
ALTER TABLE "composition_rule" ADD CONSTRAINT "composition_rule_constraint_type_id_fkey" FOREIGN KEY ("constraint_type_id") REFERENCES "constraint_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composition_rule" ADD CONSTRAINT "composition_rule_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "operation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
