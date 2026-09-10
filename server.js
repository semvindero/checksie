const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DB_FILE = path.join(__dirname, 'db.json');
const BANS_FILE = path.join(__dirname, 'banned_ips.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Активные посещения в памяти
const visits = new Map();

// ----------------------------------------------------------
// НАДЕЖНАЯ СИСТЕМА ВЕЧНОГО БАНА (ЧТЕНИЕ И ЗАПИСЬ В ФАЙЛ)
// ----------------------------------------------------------
function readBansFromFile() {
    try {
        if (!fs.existsSync(BANS_FILE)) {
            fs.writeFileSync(BANS_FILE, JSON.stringify([]));
            return new Set();
        }
        const data = fs.readFileSync(BANS_FILE, 'utf8');
        const parsed = JSON.parse(data);
        return new Set(Array.isArray(parsed) ? parsed : []);
    } catch (err) {
        console.error('Ошибка чтения banned_ips.json:', err);
        return new Set();
    }
}

function writeBansToFile(bansSet) {
    try {
        const arrayData = Array.from(bansSet);
        fs.writeFileSync(BANS_FILE, JSON.stringify(arrayData, null, 2));
    } catch (err) {
        console.error('Ошибка записи banned_ips.json:', err);
    }
}

// Загружаем баны ИЗ ФАЙЛА в глобальную переменную при старте сервера
const bannedIPs = readBansFromFile();

// Получение реального IP
function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || req.ip || '127.0.0.1';
}

// Работа с БД пользователей (db.json)
function readDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify([]));
    }
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (err) {
        return [];
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Middleware: проверка бана и регистрация активности
app.use((req, res, next) => {
    const ip = getClientIp(req);

    // Секретный маршрут саморазбана разрешен ВСЕГДА
    if (req.path === '/api/admin/self-unban') {
        return next();
    }

    // Проверка на наличие IP в списке заблокированных
    if (bannedIPs.has(ip)) {
        return res.status(403).json({
            error: 'BANNED',
            message: 'ОШИБКА ДОСТУПА: ВЫ БЫЛИ ЗАБЛОКИРОВАНЫ'
        });
    }

    visits.set(ip, {
        ip: ip,
        lastSeen: new Date(),
        userAgent: req.headers['user-agent'] || 'Unknown'
    });

    next();
});

// Middleware проверки прав st1nery own
function requireOwnRole(req, res, next) {
    const role = req.headers['x-user-role'];
    if (role !== 'st1nery own') {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
}

// ----------------------------------------------------------
// API АВТОРИЗАЦИИ И КОМАНД (ОБНОВЛЕННЫЕ ПАРОЛИ)
// ----------------------------------------------------------
app.post('/api/auth/command', (req, res) => {
    const { command } = req.body;

    if (command === 'semenzalupa') {
        return res.json({ success: true, role: 'st1nery own' });
    } else if (command === 'magajohn') {
        return res.json({ success: true, role: 'MAGA' });
    } else if (command === 'memberchck') {
        return res.json({ success: true, role: 'member' });
    }

    return res.status(400).json({ success: false, error: 'Invalid command' });
});

// ----------------------------------------------------------
// API АДМИНИСТРИРОВАНИЯ И ВЕЧНЫХ БАНОВ
// ----------------------------------------------------------

// Секретный саморазбан (по TAB + Стрелка вверх)
app.post('/api/admin/self-unban', (req, res) => {
    const ip = getClientIp(req);
    if (bannedIPs.has(ip)) {
        bannedIPs.delete(ip);
        writeBansToFile(bannedIPs);
        return res.json({ success: true, message: 'Ваш IP успешно разблокирован!' });
    }
    res.json({ success: true, message: 'IP не заблокирован.' });
});

app.get('/api/admin/visitors', requireOwnRole, (req, res) => {
    const now = Date.now();
    const result = Array.from(visits.values()).map(v => ({
        ip: v.ip,
        lastSeen: v.lastSeen,
        isOnline: (now - new Date(v.lastSeen).getTime()) < 120000,
        isBanned: bannedIPs.has(v.ip)
    }));
    res.json(result);
});

// Выдача вечного бана
app.post('/api/admin/ban', requireOwnRole, (req, res) => {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP required' });

    bannedIPs.add(ip);
    writeBansToFile(bannedIPs);
    res.json({ success: true, message: `IP ${ip} забанен ВЕЧНО` });
});

// Снятие бана вручную через админку
app.post('/api/admin/unban', requireOwnRole, (req, res) => {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP required' });

    bannedIPs.delete(ip);
    writeBansToFile(bannedIPs);
    res.json({ success: true, message: `IP ${ip} разбанен` });
});

app.delete('/api/admin/clear-users', requireOwnRole, (req, res) => {
    writeDB([]);
    res.json({ success: true });
});

// ----------------------------------------------------------
// API РЕЕСТРА ПОЛЬЗОВАТЕЛЕЙ
// ----------------------------------------------------------
app.get('/api/users', (req, res) => {
    const role = req.headers['x-user-role'];
    if (!role || role === 'guest') {
        return res.status(403).json({ error: 'Access denied' });
    }
    res.json(readDB());
});

app.post('/api/users', (req, res) => {
    const role = req.headers['x-user-role'];
    if (role !== 'st1nery own') {
        return res.status(403).json({ error: 'Access denied' });
    }

    const { fullName, age, birthCity, phone, address, telegram, vk } = req.body;
    if (!fullName || !age || !birthCity) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const users = readDB();
    const newUser = {
        id: Date.now(),
        fullName,
        age,
        birthCity,
        phone: phone || '',
        address: address || '',
        telegram: telegram || '',
        vk: vk || ''
    };

    users.push(newUser);
    writeDB(users);
    res.status(201).json(newUser);
});

app.delete('/api/users/:id', (req, res) => {
    const role = req.headers['x-user-role'];
    if (!['st1nery own', 'MAGA'].includes(role)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const id = parseInt(req.params.id, 10);
    let users = readDB();
    users = users.filter(u => u.id !== id);
    writeDB(users);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`[SERVER] Запущен на порту ${PORT}`);
});