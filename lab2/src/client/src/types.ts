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