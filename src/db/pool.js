const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  charset: "utf8mb4_unicode_ci",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  // O app fica horas sem uso. Sem estas opcoes o MySQL (ou o NAT entre o
  // Railway e o banco) derruba a conexao ociosa em silencio, o pool entrega
  // esse socket morto na proxima requisicao e a query fica pendurada ate o
  // timeout de TCP -- foi medido mais de 50s na primeira consulta depois de
  // um periodo parado, o que faz o app parecer travado.
  connectTimeout: 15000,
  // Derruba a conexao ociosa antes que o outro lado derrube.
  idleTimeout: 60000,
  maxIdle: 4,
  // Mantem o socket vivo atraves do NAT e detecta o peer morto rapido.
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

module.exports = pool;
