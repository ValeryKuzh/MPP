import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload, Role } from '../types';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error('Критическая ошибка: JWT_SECRET не задан в переменных окружения (.env)!');
}

export interface AuthRequest extends Request {
    user?: JwtPayload;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    jwt.verify(token, JWT_SECRET, (err: jwt.VerifyErrors | null, decoded: unknown) => {
        if (err) {
            return res.status(401).json({ error: 'Токен недействителен или истек' });
        }
        req.user = decoded as JwtPayload;
        next();
    });
};

export const requireRole = (allowedRoles: Role[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Доступ запрещен: недостаточно прав' });
        }
        next();
    };
};