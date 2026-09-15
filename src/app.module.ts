import {
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationError as ClassValidatorError,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { CatalogModule } from './catalog/catalog.module';
import { ValidationError } from './common/errors/validation-error';
import { DomainErrorFilter } from './common/filters/domain-error.filter';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { QuoteModule } from './quote/quote.module';
import { ServiceModule } from './service/service.module';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { TenantModule } from './tenant/tenant.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    HealthModule,
    TenantModule,
    CatalogModule,
    ServiceModule,
    QuoteModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: DomainErrorFilter },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        // Les refus de class-validator sortent au même format que le reste
        // du domaine, via l'unique filtre DomainErrorFilter.
        exceptionFactory: (errors: ClassValidatorError[]) =>
          new ValidationError(
            'VALIDATION_FAILED',
            'Requête invalide.',
            errors.map((error) => ({
              field: error.property,
              constraints: Object.values(error.constraints ?? {}),
            })),
          ),
      }),
    },
  ],
})
export class AppModule implements NestModule {
  // FR-004 : le tenant est exigé partout sauf sur la sonde technique.
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware)
      .exclude('health')
      .forRoutes('{*path}');
  }
}
