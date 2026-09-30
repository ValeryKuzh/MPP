export type Role = 'ADMIN' | 'MANAGER' | 'USER';

export interface User {
    id: number;
    email: string;
    password_hash: string;
    role: Role;
    failed_login_attempts: number;
    lockout_until: Date | null;
    created_at?: string;
}

export interface JwtPayload {
    userId: number;
    role: Role;
}

export interface Item {
    id: number;
    title: string;
    description: string | null;
    price: number;
    image_url: string | null;
    created_at?: string;
}

export interface ApiError {
    error: string;
    code?: string;
}