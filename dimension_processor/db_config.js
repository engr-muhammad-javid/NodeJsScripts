import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: '13.42.0.28',
  user: 'jd',
  password: 'jd@dbpass234213523',
  database: 'morgan_uk',
});