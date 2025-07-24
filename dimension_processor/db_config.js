import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: '',
  user: '',
  password: '',
  database: '',
});