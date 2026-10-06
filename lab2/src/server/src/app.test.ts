import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

// Подготавливаем объект мока для БД
const mockQuery = jest.fn();

jest.mock('pg', () => {
    return {
        Pool: jest.fn().mockImplementation(() => ({
            query: mockQuery,
        })),
    };
});

jest.mock('nodemailer', () => ({
    createTransport: jest.fn().mockReturnValue({
        sendMail: jest.fn().mockResolvedValue(true),
    }),
}));

import { app } from './index';

describe('API Endpoints Integration Tests', () => {
    let adminToken: string;
    let userToken: string;

    beforeAll(() => {
        // Умалчиваемый ответ на схемы initDb
        mockQuery.mockResolvedValue({ rows: [] });

        adminToken = jwt.sign({ userId: 1, role: 'ADMIN' }, process.env.JWT_SECRET || 'test_secret_key');
        userToken = jwt.sign({ userId: 2, role: 'USER' }, process.env.JWT_SECRET || 'test_secret_key');
    });

    beforeEach(() => {
        mockQuery.mockReset();
        // На случай вызовов инициализации схемы
        mockQuery.mockResolvedValue({ rows: [] });
    });

    describe('POST /api/auth/register', () => {
        it('должен успешно зарегистрировать нового пользователя', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{ id: 1, email: 'test@example.com', role: 'USER' }],
            });

            const res = await request(app)
                .post('/api/auth/register')
                .send({ email: 'test@example.com', password: 'password123' });

            expect(res.status).toBe(201);
            expect(res.body).toEqual({ id: 1, email: 'test@example.com', role: 'USER' });
        });

        it('должен вернуть 400, если email не передан', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({ password: 'password123' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Укажите корректные email и пароль');
        });

        it('должен вернуть 409 при дублировании email', async () => {
            mockQuery.mockRejectedValueOnce({ code: '23505' });

            const res = await request(app)
                .post('/api/auth/register')
                .send({ email: 'existing@example.com', password: 'password123' });

            expect(res.status).toBe(409);
            expect(res.body.error).toBe('Пользователь с таким email уже существует');
        });
    });

    describe('GET /api/items', () => {
        it('должен вернуть 401 без токена авторизации', async () => {
            const res = await request(app).get('/api/items');
            expect(res.status).toBe(401);
        });

        it('должен вернуть список товаров для авторизованного пользователя', async () => {
            const mockItems = [
                { id: 1, title: 'Item 1', price: 100 },
                { id: 2, title: 'Item 2', price: 200 },
            ];
            mockQuery.mockResolvedValueOnce({ rows: mockItems });

            const res = await request(app)
                .get('/api/items')
                .set('Authorization', `Bearer ${userToken}`);

            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockItems);
        });
    });

    describe('DELETE /api/items/:id', () => {
        it('должен запретить удаление пользователю с ролью USER (403)', async () => {
            const res = await request(app)
                .delete('/api/items/1')
                .set('Authorization', `Bearer ${userToken}`);

            expect(res.status).toBe(403);
        });

        it('должен успешно удалить товар администратором (200)', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{ id: 1, title: 'Item 1', image_url: null }],
            });

            const res = await request(app)
                .delete('/api/items/1')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Товар успешно удален');
        });

        it('должен вернуть 404, если удаляемый товар не найден', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });

            const res = await request(app)
                .delete('/api/items/999')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('Товар не найден');
        });
    });
});