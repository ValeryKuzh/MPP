import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { Item, ApiError } from './types';

const app = express();
app.use(cors());
app.use(express.json());

// Директория для загрузок
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// База данных
// Читаем DATABASE_URL или собираем через явные параметры
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

const initDb = async (retries = 5, delay = 5000): Promise<void> => {
    while (retries > 0) {
        try {
            await pool.query(`
              CREATE TABLE IF NOT EXISTS items (
                id SERIAL PRIMARY KEY,
                title VARCHAR(100) NOT NULL,
                description TEXT,
                price NUMERIC(10, 2) NOT NULL,
                image_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
              );
            `);
            console.log('PostgreSQL initialized successfully');
            return;
        } catch (err) {
            retries -= 1;
            console.error(`Database connection error. Retries left: ${retries}`);
            if (retries === 0) {
                console.error('Could not connect to PostgreSQL:', err);
            } else {
                await new Promise((res) => setTimeout(res, delay));
            }
        }
    }
};

initDb();

// Multer конфигурация
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Разрешены только изображения'));
        }
    }
});

// --- REST API ENDPOINTS ---

// GET: Все элементы
app.get('/api/items', async (_req: Request, res: Response<Item[] | ApiError>) => {
    try {
        const result = await pool.query<Item>('SELECT * FROM items ORDER BY id DESC');
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка получения данных' });
    }
});

// GET: Один элемент
app.get('/api/items/:id', async (req: Request<{ id: string }>, res: Response<Item | ApiError>) => {
    try {
        const result = await pool.query<Item>('SELECT * FROM items WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Ресурс не найден' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// POST: Создать
app.post('/api/items', upload.single('image'), async (req: Request, res: Response<Item | ApiError>) => {
    const { title, description, price } = req.body;

    if (!title || typeof title !== 'string' || title.trim() === '') {
        return res.status(400).json({ error: 'Укажите название товара' });
    }
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ error: 'Укажите корректную цену' });
    }

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    try {
        const result = await pool.query<Item>(
            'INSERT INTO items (title, description, price, image_url) VALUES ($1, $2, $3, $4) RETURNING *',
            [title.trim(), description || '', parsedPrice, imageUrl]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка создания товара' });
    }
});

// PUT: Обновить
app.put('/api/items/:id', upload.single('image'), async (req: Request<{ id: string }>, res: Response<Item | ApiError>) => {
    const { id } = req.params;
    const { title, description, price } = req.body;

    if (!title || typeof title !== 'string' || title.trim() === '') {
        return res.status(400).json({ error: 'Укажите название товара' });
    }
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ error: 'Укажите корректную цену' });
    }

    try {
        const oldRecord = await pool.query<Item>('SELECT * FROM items WHERE id = $1', [id]);
        if (oldRecord.rows.length === 0) {
            return res.status(404).json({ error: 'Товар не найден' });
        }

        let imageUrl = oldRecord.rows[0].image_url;
        if (req.file) {
            imageUrl = `/uploads/${req.file.filename}`;
        }

        const result = await pool.query<Item>(
            'UPDATE items SET title = $1, description = $2, price = $3, image_url = $4 WHERE id = $5 RETURNING *',
            [title.trim(), description || '', parsedPrice, imageUrl, id]
        );

        res.status(200).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка обновления товара' });
    }
});

// DELETE: Удалить
app.delete('/api/items/:id', async (req: Request<{ id: string }>, res: Response<{ message: string } | ApiError>) => {
    try {
        const result = await pool.query('DELETE FROM items WHERE id = $1 RETURNING *', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Элемент не найден' });
        }
        res.status(200).json({ message: 'Успешно удалено' });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка удаления' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`TS Express Server active on port ${PORT}`));