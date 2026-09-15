import { IsArray, IsUUID } from 'class-validator';

/** FR-102 : remplace l'ensemble des contraintes déclarées. Une liste vide les retire toutes. */
export class ReplaceConstraintsDto {
  @IsArray()
  @IsUUID('all', { each: true })
  constraintTypeIds: string[];
}
