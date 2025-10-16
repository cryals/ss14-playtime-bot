const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const config = require('./config');

// конект к бд
const pool = new Pool({
    host: config.database.pg_host,
    port: config.database.pg_port,
    database: config.database.pg_database,
    user: config.database.pg_username,
    password: config.database.pg_password,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

const bot = new TelegramBot(config.telegram.bot_token, { polling: true });

// хранение всякого калла
const userPaginationData = new Map();

function formatTime(timeObj) {
    if (!timeObj) return '00:00:00';

    if (timeObj && typeof timeObj === 'object') {
        const days = timeObj.days || 0;
        const hours = (timeObj.hours || 0) + (days * 24);
        const minutes = timeObj.minutes || 0;
        const seconds = timeObj.seconds || 0;

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    if (typeof timeObj === 'string') {
        return timeObj.split('.')[0];
    }

    return '00:00:00';
}

function cleanRole(role) {
    if (role.startsWith('Job')) {
        return role.slice(3);
    }
    return role;
}

function sortByTimeDesc(a, b) {
    const timeA = parseTimeToSeconds(a.timeSpent);
    const timeB = parseTimeToSeconds(b.timeSpent);
    return timeB - timeA;
}

function parseTimeToSeconds(timeStr) {
    if (!timeStr) return 0;

    const parts = timeStr.split(':');
    if (parts.length === 3) {
        const hours = parseInt(parts[0]) || 0;
        const minutes = parseInt(parts[1]) || 0;
        const seconds = parseInt(parts[2]) || 0;
        return hours * 3600 + minutes * 60 + seconds;
    }

    return 0;
}

// вперед-назад
function createPaginationKeyboard(currentPage, totalPages) {
    const keyboard = [];

    if (totalPages > 1) {
        const row = [];

        if (currentPage > 0) {
            row.push({ text: '⬅️ Назад', callback_data: `page_${currentPage - 1}` });
        }

        row.push({ text: `${currentPage + 1}/${totalPages}`, callback_data: 'current_page' });

        if (currentPage < totalPages - 1) {
            row.push({ text: 'Вперед ➡️', callback_data: `page_${currentPage + 1}` });
        }

        keyboard.push(row);
    }

    return {
        reply_markup: {
            inline_keyboard: keyboard
        }
    };
}

// формирование сообщения
function formatMessageWithPagination(username, roles, totalTime, currentPage, rolesPerPage = 10) {
    const totalPages = Math.ceil(roles.length / rolesPerPage);
    const startIndex = currentPage * rolesPerPage;
    const endIndex = startIndex + rolesPerPage;
    const currentRoles = roles.slice(startIndex, endIndex);

    let response = `⌞ ${username} ⌝\n\n`;

    currentRoles.forEach(item => {
        response += `➤ ${item.role}\n${item.timeSpent}\n`;
    });

    if (totalTime) {
        response += `\n┈➤ Всего\n${totalTime}`;
    }

    // номер страници
    if (totalPages > 1) {
        response += `\n\nСтраница ${currentPage + 1} из ${totalPages}`;
    }

    return {
        text: response,
        totalPages: totalPages,
        currentPage: currentPage
    };
}

// /play_time
bot.onText(/\/play_time (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const lastSeenUserName = match[1].trim();

    try {
        console.log(`Поиск пользователя: ${lastSeenUserName}`);

        const playTimeRes = await pool.query(
            `SELECT pt.tracker, pt.time_spent
            FROM public.play_time pt
            JOIN public.player p ON pt.player_id = p.user_id
            WHERE p.last_seen_user_name = $1
            ORDER BY pt.time_spent DESC`,
            [lastSeenUserName]
        );

        console.log(`Найдено записей в play_time: ${playTimeRes.rowCount}`);

        if (playTimeRes.rowCount === 0) {
            await bot.sendMessage(chatId, `Записей игрового времени для пользователя "${lastSeenUserName}" не найдено.`);
            return;
        }

        let totalTime = null;
        let otherRoles = [];

        // сборка
        playTimeRes.rows.forEach(row => {
            let role = cleanRole(row.tracker);
            let timeSpent = formatTime(row.time_spent);

            if (role.toLowerCase() === 'overall' || role === 'Всего') {
                if (!totalTime) {
                    totalTime = timeSpent;
                }
            } else {
                otherRoles.push({ role, timeSpent });
            }
        });

        // сортировка
        otherRoles.sort(sortByTimeDesc);

        // сохранение
        const paginationKey = `${chatId}_${lastSeenUserName}`;
        userPaginationData.set(paginationKey, {
            roles: otherRoles,
            totalTime: totalTime,
            username: lastSeenUserName,
            timestamp: Date.now()
        });

        // стирка
        cleanupOldPaginationData();

        // первое сообщение
        const { text, totalPages, currentPage } = formatMessageWithPagination(
            lastSeenUserName,
            otherRoles,
            totalTime,
            0
        );

        //кнопочки
        const options = createPaginationKeyboard(currentPage, totalPages);

        await bot.sendMessage(chatId, text, options);

    } catch (error) {
        console.error('DB error:', error);
        await bot.sendMessage(chatId, 'Произошла ошибка при запросе к базе данных.');
    }
});

// калбэки
bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const chatId = message.chat.id;
    const data = callbackQuery.data;

    try {
        if (data.startsWith('page_')) {
            const requestedPage = parseInt(data.split('_')[1]);

            // поиск
            let paginationKey = null;
            let paginationData = null;

            for (let [key, data] of userPaginationData.entries()) {
                if (key.startsWith(`${chatId}_`)) {
                    paginationKey = key;
                    paginationData = data;
                    break;
                }
            }

            if (!paginationData) {
                await bot.answerCallbackQuery(callbackQuery.id, { text: 'Данные устарели. Запросите статистику заново.' });
                return;
            }

            const { text, totalPages, currentPage } = formatMessageWithPagination(
                paginationData.username,
                paginationData.roles,
                paginationData.totalTime,
                requestedPage
            );

            const options = createPaginationKeyboard(currentPage, totalPages);

            await bot.editMessageText(text, {
                chat_id: chatId,
                message_id: message.message_id,
                ...options
            });

            await bot.answerCallbackQuery(callbackQuery.id);
        } else if (data === 'current_page') {
            await bot.answerCallbackQuery(callbackQuery.id, { text: 'Текущая страница' });
        }

    } catch (error) {
        console.error('Pagination error:', error);
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Произошла ошибка при переключении страницы.' });
    }
});

// ластик
function cleanupOldPaginationData() {
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;

    for (let [key, data] of userPaginationData.entries()) {
        if (now - data.timestamp > tenMinutes) {
            userPaginationData.delete(key);
        }
    }
}

// старт
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Добро пожаловать! Используйте команду "/play_time Ckey" для получения статистики.');
});

// справка
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Команды:\n/play_time Ckey - показать время на игровых ролях\n/help - эта справка');
});

// ошибка
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

// чистка
setInterval(cleanupOldPaginationData, 5 * 60 * 1000); // Каждые 5 минут

console.log('Стоит...');
