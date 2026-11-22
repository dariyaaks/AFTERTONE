/**
 * Демо-данные: 6 вымышленных дней с разным настроением (для видео и проверки жюри).
 * Запуск: сначала `npm start`, потом в другом окне `npm run seed`.
 * Фото — сгенерированные градиентные заглушки; замените на свои реальные кадры при желании.
 */
import jpeg from 'jpeg-js';

const API = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`;

async function call(path, { method = 'GET', token, json, form } = {}) {
  const r = await fetch(API + path, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(json ? { 'content-type': 'application/json' } : {}) },
    body: json ? JSON.stringify(json) : form,
  });
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${data?.error || ''}`);
  return data;
}

async function auth(username, password, extra = {}) {
  const email = `${username}@aftertone.test`;
  try {
    return await call('/api/auth/register', { method: 'POST', json: { username, email, password, ...extra } });
  } catch {
    return call('/api/auth/login', { method: 'POST', json: { email, password } });
  }
}

// Заглушки фото без внешних библиотек картинок: градиент и мягкие цветные пятна, кодируются jpeg-js
const hexRgb = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
async function image(colors, seed) {
  const W = 600, H = 750;
  const cs = colors.map(hexRgb);
  const blobs = [[150, 200, 210], [425, 350, 190], [250, 550, 230], [450, 125, 150]].map(([x, y, r], i) => ({
    x: (x + seed * 45) % W, y: (y + seed * 35) % H, r, c: cs[(i + 1) % cs.length],
  }));
  const data = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = (x / W + y / H) / 2;
      const px = cs[0].map((v, k) => v + (cs[cs.length - 1][k] - v) * t);
      for (const b of blobs) {
        const d2 = (x - b.x) ** 2 + (y - b.y) ** 2;
        const w = Math.exp(-d2 / (2 * (b.r * 0.6) ** 2)) * 0.85;
        for (let k = 0; k < 3; k++) px[k] = px[k] * (1 - w) + b.c[k] * w;
      }
      const o = (y * W + x) * 4;
      data[o] = px[0]; data[o + 1] = px[1]; data[o + 2] = px[2]; data[o + 3] = 255;
    }
  }
  return jpeg.encode({ data, width: W, height: H }, 88).data;
}

const shift = (days, years = 0) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

const DAYS = [
  { date: shift(0, 1), public: true, text: 'Гуляли по парку, всё в жёлтых листьях, было холодно, но мы пили какао и долго разговаривали', colors: ['#e0a040', '#c46f2a', '#f1cf85', '#8a4f23'], music: { artist: 'Frank Sinatra', title: 'Fly Me to the Moon', genre: 'Vocal Jazz', year: 1964 } },
  { date: shift(6), text: 'Срочная сдача проекта, ночь в офисе, в наушниках электронная музыка. Кофе кончился в два часа.', colors: ['#1c2a44', '#3b5a8c', '#c9d3e0', '#0e1420'], music: { artist: 'Kavinsky', title: 'Nightcall', genre: 'Electronic', year: 2010, bpm: 91, mode: 'minor' } },
  { date: shift(13), text: 'Весь день шёл дождь, было одиноко и грустно, лежал под пледом и вспоминал детство.', colors: ['#6f7a86', '#9aa3ab', '#566069', '#c3c8cc'], music: { artist: 'Ludovico Einaudi', title: 'Nuvole Bianche', genre: 'Classical', year: 2004, bpm: 62, mode: 'minor' } },
  { date: shift(27), public: true, text: 'Первый снег! Гоняли на санках с друзьями, хохотали до слёз, потом пили чай. Лучший день зимы!', colors: ['#e6f0fa', '#d9382f', '#2f6fd1', '#f6c93a'], music: { artist: 'Pharrell Williams', title: 'Happy', genre: 'Pop', year: 2013, bpm: 160, mode: 'major' } },
  { date: shift(41), public: true, text: 'Вечер у моря, закат, тёплый ветер. Дышали и ничего не делали.', colors: ['#f2a972', '#5f86b8', '#f8d9b0', '#e07a5f'], music: { artist: 'Khruangbin', title: 'Evan Finds the Third Room', genre: 'Soul', year: 2018 } },
  { date: shift(55), text: 'Приехали к бабушке, пахло пирогами, листали старые фотографии и вспоминали детство. Всё как раньше.', colors: ['#5a3b24', '#a8794a', '#d9b98a', '#3a2517'], music: { artist: 'Ella Fitzgerald', title: 'Summertime', genre: 'Jazz', year: 1958 } },
];

const demo = await auth('demo', 'demo1234', { age: 22, interests: ['кино', 'фотография', 'музыка'], displayName: 'Демо' });
console.log('Вход на сайте: почта demo@aftertone.test, пароль demo1234');

for (const [i, d] of DAYS.entries()) {
  const form = new FormData();
  form.set('text', d.text);
  form.set('date', d.date);
  form.set('music', JSON.stringify(d.music));
  form.set('ai', 'false'); // демо без внешнего сервиса: воспроизводимый результат
  for (let k = 0; k < 2; k++) form.append('photos', new Blob([await image(d.colors, i + k)], { type: 'image/jpeg' }), `p${k}.jpg`);
  const { day } = await call('/api/days', { method: 'POST', token: demo.token, form });
  if (d.public) await call(`/api/days/${day.id}`, { method: 'PATCH', token: demo.token, json: { visibility: 'public' } });
  console.log(`${day.date}  «${day.title}»  →  ${day.scene.styleLabel}${d.public ? '  (публичный: ' + day.shareUrl + ')' : ''}`);
}

// немного живой соцчасти
const guest = await auth('guest', 'guest1234', { age: 25, interests: ['музыка'], displayName: 'Гость' });
const profile = await call('/api/u/demo');
for (const card of profile.items.slice(0, 2)) {
  await call(`/api/public/${card.slug}/reaction`, { method: 'PUT', token: guest.token, json: { kind: 'cozy' } });
  await call(`/api/public/${card.slug}/comments`, { method: 'POST', token: guest.token, json: { body: 'Очень атмосферно, хочется оказаться там.' } }).catch(() => {});
}
console.log('Готово. Профиль: GET /api/u/demo, «в этот день»: GET /api/days/on-this-day (Authorization: Bearer <token>)');
