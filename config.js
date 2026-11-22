import path from 'node:path';

// .env читается встроенным средством Node (без зависимостей); если файла нет — не страшно
try {
  process.loadEnvFile();
} catch {}

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, ''),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  minorPublicSharing: process.env.MINOR_PUBLIC_SHARING === 'true',
};

if (config.jwtSecret === 'dev-secret-change-me') {
  console.warn('[config] JWT_SECRET не задан: используется небезопасный ключ для разработки');
}
