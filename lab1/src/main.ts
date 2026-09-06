import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    // Настройка EJS
    app.setViewEngine('ejs');
    app.setBaseViewsDir(join(__dirname, 'views'));

    // Статические файлы
    app.useStaticAssets(join(__dirname, '..', 'public'));

    await app.listen(3000);
    console.log('🚀 Server running on http://localhost:3000');
}
bootstrap();