import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // UI-309 : la page de démonstration est servie par Vite sur un autre port.
  // Elle est le seul client navigateur, d'où une origine unique et explicite.
  app.enableCors({
    origin: 'http://localhost:5173',
    allowedHeaders: ['Content-Type', 'X-Tenant-Id'],
    methods: ['GET', 'POST', 'PUT', 'PATCH'],
  });
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
