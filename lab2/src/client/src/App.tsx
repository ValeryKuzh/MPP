import React, { useState, useEffect, FormEvent } from 'react';
import { Item, Role, AuthResponse } from './types';

interface UserItem {
    id: number;
    email: string;
    role: Role;
    created_at?: string;
}

export const App: React.FC = () => {
    // Auth States
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const [role, setRole] = useState<Role | null>((localStorage.getItem('role') as Role) || null);

    // Auth Mode: 'login' | 'register' | 'forgot' | 'reset'
    const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Reset Password States
    const [resetToken, setResetToken] = useState<string>('');
    const [newPassword, setNewPassword] = useState<string>('');

    // Catalog States (USER / MANAGER / ADMIN)
    const [items, setItems] = useState<Item[]>([]);
    const [cart, setCart] = useState<{ item: Item; quantity: number }[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    // Manager Form States
    const [editingId, setEditingId] = useState<number | null>(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [file, setFile] = useState<File | null>(null);

    // Admin States
    const [usersList, setUsersList] = useState<UserItem[]>([]);

    // Alerts
    const [error, setError] = useState<string | null>(null);
    const [infoMessage, setInfoMessage] = useState<string | null>(null);

    const showError = (msg: string) => {
        setError(msg);
        setTimeout(() => setError(null), 5000);
    };

    const showInfo = (msg: string) => {
        setInfoMessage(msg);
        setTimeout(() => setInfoMessage(null), 5000);
    };

    // Чтение токена восстановления из URL
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const tokenFromUrl = urlParams.get('token');
        if (tokenFromUrl) {
            setResetToken(tokenFromUrl);
            setAuthMode('reset');
        }
    }, []);

    // Helper method for safe JSON response parsing
    const parseJsonResponse = async (res: Response) => {
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error(`Сервер вернул не-JSON ответ (Статус: ${res.status}). Проверьте работу бэкенда.`);
        }
        return await res.json();
    };

    // --- AUTH HANDLERS ---
    const handleLogin = async (e: FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await parseJsonResponse(res);
            if (!res.ok) throw new Error(data.error || 'Ошибка входа');

            const authData = data as AuthResponse;
            localStorage.setItem('token', authData.token);
            localStorage.setItem('role', authData.role);
            setToken(authData.token);
            setRole(authData.role);
            setPassword('');
        } catch (err: any) {
            showError(err.message);
        }
    };

    const handleRegister = async (e: FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await parseJsonResponse(res);
            if (!res.ok) throw new Error(data.error || 'Ошибка регистрации');

            showInfo('Регистрация успешна! Теперь войдите.');
            setAuthMode('login');
            setPassword('');
        } catch (err: any) {
            showError(err.message);
        }
    };

    const handleForgotPassword = async (e: FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await parseJsonResponse(res);
            if (!res.ok) throw new Error(data.error || 'Ошибка отправки запроса');

            showInfo('Инструкции по сбросу пароля отправлены на ваш email');
            setAuthMode('login');
        } catch (err: any) {
            showError(err.message);
        }
    };

    const handleResetPassword = async (e: FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: resetToken, newPassword }),
            });
            const data = await parseJsonResponse(res);
            if (!res.ok) throw new Error(data.error || 'Ошибка сброса пароля');

            showInfo('Пароль успешно изменен! Теперь вы можете войти.');
            // Очищаем URL от query-параметров
            window.history.replaceState({}, document.title, window.location.pathname);
            setNewPassword('');
            setResetToken('');
            setAuthMode('login');
        } catch (err: any) {
            showError(err.message);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        setToken(null);
        setRole(null);
        setItems([]);
        setUsersList([]);
        setCart([]);
    };

    // --- DATA FETCHING ---
    const fetchItems = async () => {
        if (!token) return;
        try {
            const res = await fetch('/api/items', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401 || res.status === 403) return handleLogout();
            const data = await parseJsonResponse(res);
            if (!res.ok) throw new Error(data.error || 'Ошибка загрузки каталога');
            setItems(data);
        } catch (err: any) {
            showError(err.message);
        }
    };

    const fetchUsers = async () => {
        if (!token || role !== 'ADMIN') return;
        try {
            const res = await fetch('/api/users', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await parseJsonResponse(res);
            if (!res.ok) throw new Error(data.error || 'Ошибка загрузки пользователей');
            setUsersList(data);
        } catch (err: any) {
            showError(err.message);
        }
    };

    useEffect(() => {
        if (token) {
            fetchItems();
            if (role === 'ADMIN') fetchUsers();
        }
    }, [token, role]);

    // --- MANAGER ACTIONS ---
    const handleSubmitItem = async (e: FormEvent) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('title', title);
        formData.append('description', description);
        formData.append('price', price);
        if (file) formData.append('image', file);

        const url = editingId ? `/api/items/${editingId}` : '/api/items';
        const method = editingId ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method,
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });
            const data = await parseJsonResponse(res);
            if (!res.ok) throw new Error(data.error || 'Ошибка сохранения');

            resetForm();
            await fetchItems();
            showInfo(editingId ? 'Товар обновлен' : 'Товар добавлен');
        } catch (err: any) {
            showError(err.message);
        }
    };

    const resetForm = () => {
        setEditingId(null);
        setTitle('');
        setDescription('');
        setPrice('');
        setFile(null);
    };

    const handleEditItem = (item: Item) => {
        setEditingId(item.id);
        setTitle(item.title);
        setDescription(item.description || '');
        setPrice(item.price.toString());
    };

    // --- ADMIN ACTIONS ---
    const handleRoleChange = async (userId: number, newRole: Role) => {
        try {
            const res = await fetch(`/api/users/${userId}/role`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ role: newRole }),
            });
            const data = await parseJsonResponse(res);
            if (!res.ok) throw new Error(data.error || 'Не удалось изменить роль');
            showInfo('Роль пользователя успешно изменена');
            await fetchUsers();
        } catch (err: any) {
            showError(err.message);
        }
    };

    const handleDeleteItem = async (id: number) => {
        if (!window.confirm('Вы действительно хотите удалить товар?')) return;
        try {
            const res = await fetch(`/api/items/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await parseJsonResponse(res);
            if (!res.ok) throw new Error(data.error || 'Ошибка удаления');
            await fetchItems();
            showInfo('Товар удален');
        } catch (err: any) {
            showError(err.message);
        }
    };

    // --- USER ACTIONS ---
    const addToCart = (item: Item) => {
        setCart((prev) => {
            const existing = prev.find((i) => i.item.id === item.id);
            if (existing) {
                return prev.map((i) =>
                    i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
                );
            }
            return [...prev, { item, quantity: 1 }];
        });
    };

    // --- RENDER UNAUTHENTICATED ---
    if (!token) {
        return (
            <div className="container" style={{ maxWidth: '400px', marginTop: '60px' }}>
                <h1 style={{ textAlign: 'center', marginBottom: '20px' }}>Вход в систему</h1>
                {error && <div className="error-banner">{error}</div>}
                {infoMessage && <div className="info-banner">{infoMessage}</div>}

                <div className="card">
                    <div className="tabs">
                        <button
                            className={`tab-btn ${authMode === 'login' ? 'active' : ''}`}
                            onClick={() => setAuthMode('login')}
                        >
                            Вход
                        </button>
                        <button
                            className={`tab-btn ${authMode === 'register' ? 'active' : ''}`}
                            onClick={() => setAuthMode('register')}
                        >
                            Регистрация
                        </button>
                        <button
                            className={`tab-btn ${authMode === 'forgot' ? 'active' : ''}`}
                            onClick={() => setAuthMode('forgot')}
                        >
                            Сброс
                        </button>
                    </div>

                    {authMode === 'login' && (
                        <form onSubmit={handleLogin}>
                            <div className="form-group">
                                <label>Email</label>
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                            </div>
                            <div className="form-group">
                                <label>Пароль</label>
                                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                                Войти
                            </button>
                        </form>
                    )}

                    {authMode === 'register' && (
                        <form onSubmit={handleRegister}>
                            <div className="form-group">
                                <label>Email</label>
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                            </div>
                            <div className="form-group">
                                <label>Пароль</label>
                                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                                Зарегистрироваться
                            </button>
                        </form>
                    )}

                    {authMode === 'forgot' && (
                        <form onSubmit={handleForgotPassword}>
                            <div className="form-group">
                                <label>Email</label>
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                                Отправить ссылку для сброса
                            </button>
                        </form>
                    )}

                    {authMode === 'reset' && (
                        <form onSubmit={handleResetPassword}>
                            <div className="form-group">
                                <label>Новый пароль</label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Введите новый пароль"
                                    required
                                />
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                                Сохранить новый пароль
                            </button>
                        </form>
                    )}
                </div>
            </div>
        );
    }

    // --- RENDER AUTHENTICATED (BY ROLE) ---
    const filteredItems = items.filter((i) =>
        i.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="container">
            <header className="header">
                <div>
                    <h2>Портал Системы</h2>
                    <span className={`badge badge-${role?.toLowerCase()}`}>Роль: {role}</span>
                </div>
                <button className="btn btn-secondary" onClick={handleLogout}>
                    Выйти
                </button>
            </header>

            {error && <div className="error-banner">{error}</div>}
            {infoMessage && <div className="info-banner">{infoMessage}</div>}

            {/* ЭКРАН 1: РЕЖИМ ОБЫЧНОГО ПОЛЬЗОВАТЕЛЯ (USER) */}
            {role === 'USER' && (
                <div className="user-view">
                    <h3>Витрина товаров</h3>
                    <div className="form-group" style={{ marginTop: '15px' }}>
                        <input
                            type="text"
                            placeholder="Поиск по названию..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="grid-user">
                        <div className="products-grid">
                            {filteredItems.map((item) => (
                                <div key={item.id} className="product-card">
                                    {item.image_url && <img src={item.image_url} alt={item.title} className="product-img" />}
                                    <h4>{item.title}</h4>
                                    <p className="price">${item.price}</p>
                                    <p className="desc">{item.description}</p>
                                    <button className="btn btn-primary" onClick={() => addToCart(item)}>
                                        В корзину
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="card cart-card">
                            <h4>Моя Корзина ({cart.reduce((a, b) => a + b.quantity, 0)})</h4>
                            {cart.length === 0 ? (
                                <p style={{ fontSize: '13px', color: '#718096' }}>Корзина пуста</p>
                            ) : (
                                <div>
                                    {cart.map((c) => (
                                        <div key={c.item.id} className="cart-item">
                                            <span>{c.item.title} (x{c.quantity})</span>
                                            <strong>${(Number(c.item.price) * c.quantity).toFixed(2)}</strong>
                                        </div>
                                    ))}
                                    <hr style={{ margin: '10px 0' }} />
                                    <strong>
                                        Итого: ${cart.reduce((sum, c) => sum + Number(c.item.price) * c.quantity, 0).toFixed(2)}
                                    </strong>
                                    <button
                                        className="btn btn-primary"
                                        style={{ width: '100%', marginTop: '10px' }}
                                        onClick={() => {
                                            showInfo('Заказ успешно оформлен!');
                                            setCart([]);
                                        }}
                                    >
                                        Оформить заказ
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ЭКРАН 2: РЕЖИМ МЕНЕДЖЕРА (MANAGER) */}
            {role === 'MANAGER' && (
                <div className="manager-view">
                    <h3>Панель управления каталогом</h3>
                    <div className="grid" style={{ marginTop: '15px' }}>
                        <div className="card">
                            <h4>{editingId ? 'Редактировать товар' : 'Добавить товар'}</h4>
                            <form onSubmit={handleSubmitItem}>
                                <div className="form-group">
                                    <label>Название *</label>
                                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
                                </div>
                                <div className="form-group">
                                    <label>Описание</label>
                                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label>Цена ($) *</label>
                                    <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
                                </div>
                                <div className="form-group">
                                    <label>Изображение</label>
                                    <input type="file" accept="image/*" onChange={(e) => e.target.files && setFile(e.target.files[0])} />
                                </div>
                                <button type="submit" className="btn btn-primary">Сохранить</button>
                                {editingId && (
                                    <button type="button" className="btn btn-secondary" onClick={resetForm} style={{ marginLeft: '8px' }}>
                                        Отмена
                                    </button>
                                )}
                            </form>
                        </div>

                        <div className="card">
                            <h4>Управление позициями ({items.length})</h4>
                            {items.map((item) => (
                                <div key={item.id} className="item-card">
                                    <div>
                                        <strong>{item.title}</strong> — ${item.price}
                                    </div>
                                    <button className="btn btn-edit" onClick={() => handleEditItem(item)}>
                                        Редактировать
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ЭКРАН 3: РЕЖИМ АДМИНИСТРАТОРА (ADMIN) */}
            {role === 'ADMIN' && (
                <div className="admin-view">
                    <h3>Административный центр</h3>
                    <div className="card" style={{ marginTop: '15px' }}>
                        <h4>Управление пользователями и правами</h4>
                        <table className="admin-table">
                            <thead>
                            <tr>
                                <th>ID</th>
                                <th>Email</th>
                                <th>Текущая роль</th>
                                <th>Изменить роль</th>
                            </tr>
                            </thead>
                            <tbody>
                            {usersList.map((u) => (
                                <tr key={u.id}>
                                    <td>{u.id}</td>
                                    <td>{u.email}</td>
                                    <td><strong>{u.role}</strong></td>
                                    <td>
                                        <select
                                            value={u.role}
                                            onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                                        >
                                            <option value="USER">USER</option>
                                            <option value="MANAGER">MANAGER</option>
                                            <option value="ADMIN">ADMIN</option>
                                        </select>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="card" style={{ marginTop: '20px' }}>
                        <h4>Полное управление товарами (с правами удаления)</h4>
                        {items.map((item) => (
                            <div key={item.id} className="item-card">
                                <div>
                                    <strong>{item.title}</strong> — ${item.price}
                                </div>
                                <button className="btn btn-delete" onClick={() => handleDeleteItem(item.id)}>
                                    Удалить позицию
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};