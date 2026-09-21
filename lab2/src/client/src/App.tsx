import React, { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { Item, ApiError } from './types';

export const App: React.FC = () => {
    const [items, setItems] = useState<Item[]>([]);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [title, setTitle] = useState<string>('');
    const [description, setDescription] = useState<string>('');
    const [price, setPrice] = useState<string>('');
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);

    const showError = (msg: string) => {
        setError(msg);
        setTimeout(() => setError(null), 5000);
    };

    // GET: Загрузка списка
    const fetchItems = async () => {
        try {
            const res = await fetch('/api/items');
            if (!res.ok) {
                const errData: ApiError = await res.json();
                throw new Error(errData.error || 'Ошибка при загрузке элементов');
            }
            const data: Item[] = await res.json();
            setItems(data);
        } catch (err: unknown) {
            if (err instanceof Error) showError(err.message);
        }
    };

    useEffect(() => {
        fetchItems();
    }, []);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const resetForm = () => {
        setEditingId(null);
        setTitle('');
        setDescription('');
        setPrice('');
        setFile(null);
        const fileInput = document.getElementById('file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
    };

    // POST / PUT: Создание и редактирование (multipart/form-data)
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        const formData = new FormData();
        formData.append('title', title);
        formData.append('description', description);
        formData.append('price', price);
        if (file) {
            formData.append('image', file);
        }

        const url = editingId ? `/api/items/${editingId}` : '/api/items';
        const method = editingId ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, { method, body: formData });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Ошибка сохранения');
            }

            resetForm();
            await fetchItems();
        } catch (err: unknown) {
            if (err instanceof Error) showError(err.message);
        }
    };

    // Заполнение формы для PUT
    const handleEdit = (item: Item) => {
        setEditingId(item.id);
        setTitle(item.title);
        setDescription(item.description || '');
        setPrice(item.price.toString());
        setFile(null);
    };

    // DELETE: Удаление
    const handleDelete = async (id: number) => {
        if (!window.confirm('Удалить данный элемент?')) return;

        try {
            const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data: ApiError = await res.json();
                throw new Error(data.error || 'Ошибка при удалении');
            }
            await fetchItems();
        } catch (err: unknown) {
            if (err instanceof Error) showError(err.message);
        }
    };

    return (
        <div className="container">
            <h1>Каталог товаров</h1>

            {error && <div className="error-banner">{error}</div>}

            <div className="grid">
                {/* Форма ввода */}
                <div className="card">
                    <h3>{editingId ? 'Редактирование' : 'Добавление'}</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Название *</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Описание</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label>Цена ($) *</label>
                            <input
                                type="number"
                                step="0.01"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Изображение</label>
                            <input
                                id="file-input"
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                            />
                        </div>
                        <button type="submit" className="btn btn-primary">
                            Сохранить
                        </button>
                        {editingId && (
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={resetForm}
                            >
                                Отмена
                            </button>
                        )}
                    </form>
                </div>

                {/* Список элементов */}
                <div className="card">
                    <h3>Список элементов ({items.length})</h3>
                    <div style={{ marginTop: '10px' }}>
                        {items.length === 0 ? (
                            <p>Список пуст</p>
                        ) : (
                            items.map((item) => (
                                <div key={item.id} className="item-card">
                                    <div className="item-info">
                                        {item.image_url && (
                                            <img
                                                src={item.image_url}
                                                alt={item.title}
                                                className="item-img"
                                            />
                                        )}
                                        <div>
                                            <strong>{item.title}</strong> — ${item.price}
                                            {item.description && (
                                                <p style={{ fontSize: '12px', color: '#666' }}>
                                                    {item.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <button
                                            className="btn btn-edit"
                                            onClick={() => handleEdit(item)}
                                        >
                                            Изм.
                                        </button>
                                        <button
                                            className="btn btn-delete"
                                            onClick={() => handleDelete(item.id)}
                                        >
                                            Уд.
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};