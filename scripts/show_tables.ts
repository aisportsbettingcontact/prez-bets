import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL!);
const [tables] = await conn.execute<any[]>('SHOW TABLES');
console.log('Tables:', JSON.stringify(tables));
await conn.end();
