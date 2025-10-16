const fs = require('fs');
const ini = require('ini');

const config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));

module.exports = {
    database: {
        pg_host: config.database.pg_host,
        pg_port: Number(config.database.pg_port),
        pg_database: config.database.pg_database,
        pg_username: config.database.pg_username,
        pg_password: config.database.pg_password,
    },
    telegram: {
        bot_token: config.telegram.token,
    },
};
