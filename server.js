import express from 'express';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import { config } from './config.js';
import './db.js';
import authRoutes from './routes/auth.js';
import daysRoutes from './routes/days.js';
import musicRoutes from './routes/music.js';
import socialRoutes from './routes/social.js';

const app = express();

app.disable('x-powered-by');
app.use(cors({
  origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()),
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
}));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, ai: !!config.anthropicKey }));
app.use('/api/auth', authRoutes);
app.use('/api/days', daysRoutes);
app.use('/api/music', musicRoutes);
app.use('/api', socialRoutes);

app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Маршрут не найден' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Файл слишком большой (максимум 15 МБ)' : 'Слишком много файлов (до 8 фото и 1 песни)';
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: msg });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некорректный JSON' });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

app.listen(config.port, () =>
  console.log(`API: http://localhost:${config.port}/api/health  (ИИ-анализ: ${config.anthropicKey ? 'включён' : 'выключен, работает словарь'})`),
);
