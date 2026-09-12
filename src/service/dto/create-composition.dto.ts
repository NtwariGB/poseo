import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

/** FR-101 : création d'une prestation. Le type de produit n'est plus modifiable ensuite. */
export class CreateCompositionDto {
  @IsUUID()
  productTypeId: string;

  @IsString()
  @IsNotEmpty()
  productRef: string;

  @IsString()
  @IsNotEmpty()
  addressLine: string;

  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @IsString()
  @IsNotEmpty()
  city: string;
}
