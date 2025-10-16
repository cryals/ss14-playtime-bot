# SS14 PlayTime Telegram Bot

Telegram бот для отображения статистики игрового времени из базы данных SS14.

## Функциональность

- Команда `/play_time CKey` - показывает статистику по ролям
- Пагинация с кнопками навигации
- Сортировка по убыванию времени
- Автоматическое форматирование времени

## Установка

1. Клонируйте репозиторий:
```bash
git clone https://github.com/cryals/ss14-playtime-bot.git
cd ss14-playtime-bot
```

2. Установите зависимости:
```bash
npm install
```

3. Настройте конфигурацию:
```bash
cp config.ini.example config.ini
# отредактируйте config.ini с вашими настройками
```

4. Запустите бота:
```bash
npm start
```

## Конфигурация

Создайте файл `config.ini` на основе `config.ini.example`:

```ini
[database]
pg_host = you_database_host_here
pg_port = you_database_port_here
pg_database = you_database_name_here
pg_username = you_username_here
pg_password = your_password_here

[telegram]
token = your_telegram_bot_token_here
```

## Команды

- `/start` - начать работу с ботом
- `/play_time CKey` - показать статистику игрового времени
- `/help` - показать справку

## Структура базы данных

Бот ожидает следующие таблицы в PostgreSQL:

- `player` - информация о игроках
- `play_time` - статистика времени по ролям
  telegram: {
    bot_token: "your_telegram_bot_token_here"
  }
};
