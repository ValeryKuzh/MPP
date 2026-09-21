FROM node:20-alpine AS builder

WORKDIR /app

# Копируем манифесты зависимостей
COPY package*.json ./

# Устанавливаем все зависимости (включая devDependencies для сборки)
RUN npm ci

# Копируем исходный код сервера
COPY . .

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

# Устанавливаем только продакшен-зависимости
RUN npm ci --only=production

# Копируем собранный бандл из этапа builder
COPY --from=builder /app/dist ./dist

# Создаем директорию для загружаемых файлов, если используется загрузка мультимедиа
RUN mkdir -p uploads

EXPOSE 5000

CMD ["node", "dist/index.js"]