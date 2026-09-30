export type Role = 'ADMIN' | 'MANAGER' | 'USER';

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
}

export interface AuthResponse {
    token: string;
    role: Role;
}