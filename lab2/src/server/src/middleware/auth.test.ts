import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateToken, requireRole, AuthRequest } from './auth';

process.env.JWT_SECRET = 'test_secret';

describe('Auth Middleware', () => {
    let mockReq: Partial<AuthRequest>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        mockReq = { headers: {} };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        mockNext = jest.fn();
    });

    describe('authenticateToken', () => {
        it('должен вернуть 401, если заголовок Authorization отсутствует', () => {
            authenticateToken(mockReq as AuthRequest, mockRes as Response, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Требуется авторизация' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('должен вернуть 401 при недействительном токене', () => {
            mockReq.headers = { authorization: 'Bearer invalid_token' };

            authenticateToken(mockReq as AuthRequest, mockRes as Response, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Токен недействителен или истек' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('должен пропустить запрос и записать payload в req.user при валидном токене', (done) => {
            const payload = { userId: 1, role: 'USER' };
            const token = jwt.sign(payload, 'test_secret_key');
            mockReq.headers = { authorization: `Bearer ${token}` };

            const originalNext = mockNext;
            mockNext = jest.fn(() => {
                try {
                    expect(mockReq.user).toMatchObject(payload);
                    done();
                } catch (error) {
                    done(error);
                }
            });

            authenticateToken(mockReq as AuthRequest, mockRes as Response, mockNext);
        });
    });

    describe('requireRole', () => {
        it('должен вернуть 403, если у пользователя недостаточно прав', () => {
            mockReq.user = { userId: 1, role: 'USER' };
            const middleware = requireRole(['ADMIN']);

            middleware(mockReq as AuthRequest, mockRes as Response, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Доступ запрещен: недостаточно прав' });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('должен вызывать next(), если роль пользователя разрешена', () => {
            mockReq.user = { userId: 1, role: 'ADMIN' };
            const middleware = requireRole(['ADMIN', 'MANAGER']);

            middleware(mockReq as AuthRequest, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });
    });
});