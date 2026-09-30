import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import 'express-async-errors'; // Перехватывает ошибки в async-маршрутах
import { Pool } from 'pg';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';
import pinoHttp from 'pino-http';

import { Item, ApiError, User, Role, JwtPayload } from './types';
import { authenticateToken, requireRole, AuthRequest } from './middleware/auth';
import { logger } from './logger';

const app = express();

if (!process.env.JWT_SECRET) {
    logger.error('CRITICAL: JWT_SECRET не задан в переменных окружения!');
    process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

app.use(cors());
app.use(express.json());

// 1. Логирование HTTP-запросов
app.use(pinoHttp({ logger }));

// Директория для загрузки файлов
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// Инициализация подключения к PostgreSQL
const pool = new Pool(
    process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
            host: process.env.DB_HOST || 'postgres',
            port: Number(process.env.DB_PORT) || 5432,
            user: process.env.DB_USER || 'postgres_user',
            password: process.env.DB_PASSWORD || 'postgres_password',
            database: process.env.DB_NAME || 'app_db',
        }
);

// Инициализация схемы базы данных
const initDb = async (retries = 5, delay = 5000): Promise<void> => {
    while (retries > 0) {
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS users (
                                                     id SERIAL PRIMARY KEY,
                                                     email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    role VARCHAR(20) NOT NULL DEFAULT 'USER',
                    failed_login_attempts INT DEFAULT 0,
                    lockout_until TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                CREATE TABLE IF NOT EXISTS password_resets (
                                                               id SERIAL PRIMARY KEY,
                                                               user_id INT REFERENCES users(id) ON DELETE CASCADE,
                    token VARCHAR(255) NOT NULL,
                    expires_at TIMESTAMP NOT NULL
                    );

                CREATE TABLE IF NOT EXISTS items (
                                                     id SERIAL PRIMARY KEY,
                                                     title VARCHAR(100) NOT NULL,
                    description TEXT,
                    price NUMERIC(10, 2) NOT NULL,
                    image_url TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
            `);
            logger.info('Database schemas initialized successfully');
            return;
        } catch (err) {
            retries -= 1;
            logger.error(`Database connection error. Retries left: ${retries}`);
            if (retries === 0) {
                logger.error({ err }, 'Could not connect to PostgreSQL');
            } else {
                await new Promise((res) => setTimeout(res, delay));
            }
        }
    }
};

initDb();

// Конфигурация Multer
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Исправлено: 5MB
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Разрешена загрузка только изображений'));
        }
    }
});

// Rate Limiting для входа
const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // Исправлено: 15 минут
    max: 5,
    message: { error: 'Слишком много попыток входа. Попробуйте через 15 минут.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Настройка почтового сервиса
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
    port: Number(process.env.SMTP_PORT) || 2525,
    auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
    },
});

// Вспомогательная функция для удаления файлов
const deleteFileIfExists = (relativeUrl: string | null) => {
    if (!relativeUrl) return;
    const filename = path.basename(relativeUrl);
    const filePath = path.join(uploadDir, filename);
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) logger.error(`Ошибка удаления файла: ${filePath}`);
        });
    }
};

// --- AUTH ENDPOINTS ---

app.post('/api/auth/register', (async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ error: 'Укажите корректные email и пароль' });
    }

    const hash = await bcrypt.hash(password, 10);

    try {
        const result = await pool.query<User>(
            "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'USER') RETURNING id, email, role",
            [email.toLowerCase().trim(), hash]
        );
        res.status(201).json(result.rows[0]);
    } catch (err: any) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
        }
        res.status(500).json({ error: 'Ошибка при регистрации' });
    }
}) as RequestHandler);

app.post('/api/auth/login', loginRateLimiter, (async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Заполните поля email и пароль' });
    }

    const result = await pool.query<User>('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Неверные учетные данные' });
    }

    const user = result.rows[0];

    if (user.lockout_until && new Date(user.lockout_until) > new Date()) {
        return res.status(429).json({ error: 'Учетная запись временно заблокирована. Попробуйте позже.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
        const attempts = user.failed_login_attempts + 1;
        let lockoutQuery = 'UPDATE users SET failed_login_attempts = $1 WHERE id = $2';

        if (attempts >= 5) {
            lockoutQuery = "UPDATE users SET failed_login_attempts = $1, lockout_until = NOW() + INTERVAL '15 minutes' WHERE id = $2";
        }
        await pool.query(lockoutQuery, [attempts, user.id]);
        return res.status(401).json({ error: 'Неверные учетные данные' });
    }

    await pool.query('UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE id = $1', [user.id]);

    const payload: JwtPayload = { userId: user.id, role: user.role };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

    res.status(200).json({ token, role: user.role });
}) as RequestHandler);

app.post('/api/auth/forgot-password', (async (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Укажите email' });
    }

    const result = await pool.query<User>('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);

    // Исправлено: защита от enumeration-атак
    if (result.rows.length > 0) {
        const user = result.rows[0];
        const resetToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '15m' });
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // Исправлено

        await pool.query('INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)', [
            user.id,
            resetToken,
            expiresAt,
        ]);

        await transporter.sendMail({
            to: email,
            subject: 'Восстановление доступа',
            text: `Ваш токен восстановления доступа: ${resetToken}`,
        });
    }

    res.status(200).json({ message: 'Если указанный email зарегистрирован, инструкции будут отправлены.' });
}) as RequestHandler);

// --- REST API: ITEMS ---

app.get('/api/items', authenticateToken, requireRole(['USER', 'MANAGER', 'ADMIN']), (async (_req: AuthRequest, res: Response) => {
    const result = await pool.query<Item>('SELECT * FROM items ORDER BY id DESC');
    res.status(200).json(result.rows);
}) as RequestHandler);

app.get('/api/items/:id', authenticateToken, requireRole(['USER', 'MANAGER', 'ADMIN']), (async (req: AuthRequest, res: Response) => {
    const itemId = parseInt(req.params.id, 10);
    if (isNaN(itemId)) {
        return res.status(400).json({ error: 'Некорректный ID товара' });
    }

    const result = await pool.query<Item>('SELECT * FROM items WHERE id = $1', [itemId]);
    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Товар не найден' });
    }
    res.status(200).json(result.rows[0]);
}) as RequestHandler);

app.post('/api/items', authenticateToken, requireRole(['MANAGER', 'ADMIN']), upload.single('image'), (async (req: AuthRequest, res: Response) => {
    const { title, description, price } = req.body;

    if (!title || typeof title !== 'string' || title.trim() === '') {
        return res.status(400).json({ error: 'Укажите наименование товара' });
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ error: 'Укажите корректную цену' });
    }

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const result = await pool.query<Item>(
        'INSERT INTO items (title, description, price, image_url) VALUES ($1, $2, $3, $4) RETURNING *',
        [title.trim(), description || '', parsedPrice, imageUrl]
    );
    res.status(201).json(result.rows[0]);
}) as RequestHandler);

app.put('/api/items/:id', authenticateToken, requireRole(['MANAGER', 'ADMIN']), upload.single('image'), (async (req: AuthRequest, res: Response) => {
    const itemId = parseInt(req.params.id, 10);
    if (isNaN(itemId)) {
        return res.status(400).json({ error: 'Некорректный ID товара' });
    }

    const { title, description, price } = req.body;

    if (!title || typeof title !== 'string' || title.trim() === '') {
        return res.status(400).json({ error: 'Укажите наименование товара' });
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ error: 'Укажите корректную цену' });
    }

    const oldRecord = await pool.query<Item>('SELECT * FROM items WHERE id = $1', [itemId]);
    if (oldRecord.rows.length === 0) {
        return res.status(404).json({ error: 'Товар не найден' });
    }

    let imageUrl = oldRecord.rows[0].image_url;
    if (req.file) {
        // Удаляем старое изображение с диска
        deleteFileIfExists(oldRecord.rows[0].image_url);
        imageUrl = `/uploads/${req.file.filename}`;
    }

    const result = await pool.query<Item>(
        'UPDATE items SET title = $1, description = $2, price = $3, image_url = $4 WHERE id = $5 RETURNING *',
        [title.trim(), description || '', parsedPrice, imageUrl, itemId]
    );

    res.status(200).json(result.rows[0]);
}) as RequestHandler);

app.delete('/api/items/:id', authenticateToken, requireRole(['ADMIN']), (async (req: AuthRequest, res: Response) => {
    const itemId = parseInt(req.params.id, 10);
    if (isNaN(itemId)) {
        return res.status(400).json({ error: 'Некорректный ID товара' });
    }

    const result = await pool.query<Item>('DELETE FROM items WHERE id = $1 RETURNING *', [itemId]);
    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Товар не найден' });
    }

    // Удаляем изображение товара при удалении записи
    deleteFileIfExists(result.rows[0].image_url);

    res.status(200).json({ message: 'Товар успешно удален' });
}) as RequestHandler);

// --- REST API: USERS (ADMIN ONLY) ---

app.get('/api/users', authenticateToken, requireRole(['ADMIN']), (async (_req: AuthRequest, res: Response) => {
    const result = await pool.query('SELECT id, email, role, created_at FROM users ORDER BY id ASC');
    res.status(200).json(result.rows);
}) as RequestHandler);

app.patch('/api/users/:id/role', authenticateToken, requireRole(['ADMIN']), (async (req: AuthRequest, res: Response) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
        return res.status(400).json({ error: 'Некорректный ID пользователя' });
    }

    const { role } = req.body;
    if (!['ADMIN', 'MANAGER', 'USER'].includes(role)) {
        return res.status(400).json({ error: 'Указана недопустимая роль' });
    }

    const result = await pool.query(
        'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, role',
        [role, userId]
    );
    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.status(200).json(result.rows[0]);
}) as RequestHandler);

// Глобальная обработка ошибок Express
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    logger.error(err);

    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Размер файла превышает допустимый лимит (5 MB)' });
        }
        return res.status(400).json({ error: `Ошибка загрузки файла: ${err.message}` });
    }

    if (err.message === 'Разрешена загрузка только изображений') {
        return res.status(400).json({ error: err.message });
    }

    const status = err.status || 500;
    res.status(status).json({
        error: err.message || 'Внутренняя ошибка сервера',
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => logger.info(`Server active on port ${PORT}`));