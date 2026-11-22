# Бэкенд «Дневник-воспоминание» (ArtTech)

Node.js + Express + SQLite (встроенный `node:sqlite`, ничего компилировать не нужно). Принимает запись дня (текст, фото, песня) и возвращает **сцену**: готовый набор параметров (палитра, ритм монтажа, шейдер, частицы, коллаж, киношное приглушение музыки, аватар, голос) и **паспорт настроения** («почему день выглядит так»). Фронтенд только рисует то, что пришло в `scene`.

## Запуск
```bash
npm install
cp .env.example .env      # задайте JWT_SECRET, PUBLIC_URL (адрес фронтенда)
npm start                 # сайт: http://localhost:4000  ·  проверка: http://localhost:4000/api/health
npm run seed              # в другом окне: 6 демо-дней; вход demo@aftertone.test / demo1234
npm test                  # тесты движка
```
Нужен Node ≥ 22.13. Ключ `ANTHROPIC_API_KEY` необязателен: без него анализ текста идёт по словарю.

## API (всё под `/api`, авторизация: `Authorization: Bearer <token>`)
| Метод и путь | Что делает |
|---|---|
| `POST /auth/register` `{email, password, age, displayName?, interests[]?, username?}` (публичный ник создаётся сам, почта нигде не показывается) | регистрация → `{token, user}`; `user.recommendedFormats` — какой формат показать первым |
| `POST /auth/login` `{email, password}`, `GET/PATCH /auth/me` | вход, профиль |
| `POST /days/preview` `{text, bpm?, genre?}` | живой предпросмотр, пока человек печатает (палитра, приём, частицы) |
| `POST /days` (multipart) | создать день. Поля: `text`, `photos` (1–8 файлов), `date?`, `format?` (`slideshow`/`collage`/`video`), `style?`, `keyQuote?`, `ai?` (`false` — не отправлять текст во внешний ИИ), песня: `music` (JSON) или `musicTitle/musicArtist/musicGenre/musicYear/musicUrl/musicPreviewUrl/musicBpm/musicMode`, либо файл `audio` |
| `GET /days?q=&style=&from=&to=&limit=&offset=` | архив (карточки) |
| `GET /days/calendar?year=2026` | тепловая карта: цвет и настроение каждого дня |
| `GET /days/on-this-day?asOf=ГГГГ-ММ-ДД` | «в этот день»: 1, 3, 6 месяцев и N лет назад; `asOf` — перемотка для демо |
| `GET/PATCH/DELETE /days/:id` | день целиком; `PATCH {visibility, title, commentsEnabled, ownsRights}` |
| `POST /days/:id/regenerate` `{style?, format?}` | пересобрать другим приёмом из сохранённых данных |
| `GET /music/search?q=` | поиск песни, 30-секундные превью (iTunes Search API) |
| `GET /music/preview?url=` | прокси превью с CORS: без него Web Audio не даст приглушать звук |
| `GET /u/:username` | публичный профиль и его открытые дни |
| `GET /public/:slug` | открытый день по ссылке |
| `PUT /public/:slug/reaction` `{kind}` | реакция: `warm`, `cozy`, `chills`, `nostalgic`, `spark` (повтор снимает) |
| `GET/POST /public/:slug/comments`, `DELETE /comments/:id` | комментарии (до 500 символов, лимит 6 в минуту) |

URL фото и звука в ответах относительные (`/api/days/...`): добавьте адрес API. Для приватных дней в них уже есть короткоживущий токен `?m=`, так что `<img src>` работает без заголовка.

## Что читать фронтенду из `day.scene`
`style`, `theme`, `palette` (`bg, surface, text, accent, accent2, highlight, gradient[]`), `typography`, `constants` (общие для всех дней: сетка, места даты и подписи, шрифты), `filters.css`, `shader` (пресет, скорость от BPM, цвета, `audioReactive`), `particles`, `timeline[]` (слайд-шоу и видео: кадр, длительность, Ken Burns, переход), `collage.items[]` (доли холста 4:5), `audio`, `avatar`, а также `passport[]`.

Киношное приглушение (параметры уже посчитаны в `scene.audio`):
```js
const { quote, ducking, cinematic } = scene.audio;
// музыка → lowpass → gain → выход (через /music/preview, чтобы был CORS)
function duck(on) {
  const t = ctx.currentTime;
  musicGain.gain.setTargetAtTime(on ? ducking.duckGain : 1, t, (on ? ducking.attackMs : ducking.releaseMs) / 1000 / 3);
  lowpass.frequency.setTargetAtTime(on ? ducking.lowpassHz : 20000, t, 0.2);
}
// в quote.startAt: duck(true), показать letterbox (cinematic.letterbox), слова по одному; через quote.durationSec: duck(false)
```
Озвучка: `scene.audio.voice` (`rate`, `pitch`) передаёте в `speechSynthesis`; события `onstart/onend` вызывают `duck(true/false)`.
Темп песни можно измерить в браузере и прислать в `musicBpm`: функция `estimateBpm` лежит в `src/engine/music.js` (работает на `getChannelData(0)`). Без этого темп оценивается по жанру, и паспорт честно пишет «оценка по жанру».

## Как работает «дизайн» (для описания проекта)
1. **Текст** → тональность и энергия, время года и суток, погода, место, предмет, ключевая фраза, название 3–7 слов (словарь; с ключом ИИ уточняет).
2. **Фото** → доминирующие цвета (k-means), свет, насыщенность, тёплость, контраст.
3. **Песня** → BPM (измеренный или по жанру), лад, эпоха, энергия.
4. Всё сводится в вектор `valence / energy / air / tension / nostalgia`. По нему правилами выбирается приём: Моне (воздух, свет), Кандинский (ритм и напряжение), плёнка (ностальгия), японский минимализм (тишина и пустота). Цвета всегда берутся из ваших фото, приём меняет только их обработку, поэтому «грустно» не равно «синий».
5. Постоянное (`constants`) одинаково во всех днях, переменное (палитра, обработка, ритм, движение) меняется. Названия папок: 3–7 слов в одном тоне.

## Решения по безопасности и правилам кейса
- Из загруженных фото удаляются метаданные (геолокация) при перекодировании.
- Песни целиком не распространяются: ссылки, 30-секундные превью, либо свой файл. Публикация дня с загруженным файлом требует `ownsRights: true`.
- Голоса только синтезированные; аватар и настроение описывают атмосферу записи, не диагноз (поле `scene.disclaimer`).
- Аккаунтам младше 18 лет публикация закрыта (`MINOR_PUBLIC_SHARING=true` отключает ограничение). Возраст после регистрации не меняется.
- Текст уходит во внешний ИИ только если задан ключ и не передан `ai=false`.

## Использованные инструменты
Express, встроенный node:sqlite, sharp (обработка фото; если не загрузился — запасной режим jpeg-js + pngjs), bcryptjs, jsonwebtoken, multer, cors; iTunes Search API (превью); опционально Claude API (анализ текста). Все остальное (анализ цвета, профиль музыки, выбор приёма, паспорт) написано командой в `src/engine`.

## Папка дня на диске
`data/users/<id>/<дата Название дня>/` содержит `photo-01.jpg…`, `text.txt`, `memory.json` (сцена, паспорт, анализ, параметры голоса) и `song.*` (если загружен файл).

## Если sharp не устанавливается
Бэкенд сам переключится на запасной режим (jpeg-js и pngjs, поддерживаются JPEG и PNG, а WebP нет). В терминале при первой загрузке фото появится строка «sharp недоступен — включён запасной режим». Это нормально.

## Фронтенд
Папка `public/` — сайт AFTERTONE (главная `index.html`, вход `vhod.html`, дневник `app.html`). Бэкенд раздаёт её сам, поэтому отдельно запускать фронтенд не нужно, а CORS не мешает: всё открывается по одному адресу `http://localhost:4000`.

Порядок страниц: `index.html` → `vhod.html` (регистрация) → `onboarding.html` (имя, компаньон, интересы) → `dashboard.html` (архив, папки, календарь) → `memory-studio.html` (создание) → `memory.html` (разворот блокнота + кино-плеер + паспорт настроения, пересборка другим приёмом, публичная ссылка) → `share.html?s=<slug>` (публичная страница: реакции и комментарии). `app.html` — упрощённая запасная версия дневника. Дополнительно: `insights.html` (год в цвете, аватары последних дней, статистика, ролик месяца), `profile.html?u=ник` (публичная страница автора). В плеере воспоминания частицы (дождь, снег, листья, светлячки, пыль, геометрия) рисуются по погоде и приёму дня, аватар меняется от настроения. Вход по существующему аккаунту ведёт сразу в `dashboard.html`. Папки (коллекции) хранятся в браузере. Имя, «о себе» и интересы сохраняются на сервере; компаньон и аватар пока только в браузере (`localStorage`, ключ `aftertoneProfile`). Картинки компаньонов кладутся в `public/images/companions/owl.png`, `cat.png`, `fox.png`, `bunny.png`, `bear.png`, `deer.png`.

## Хостинг (чтобы у жюри была ссылка)
Проект готов к запуску в Docker: `Dockerfile` лежит в корне. На Render/Railway создайте Web Service из репозитория (или Docker-образа) и задайте переменные: `JWT_SECRET` (длинная случайная строка), `PUBLIC_URL` (адрес вашего сайта), `DATA_DIR=/data` и примонтируйте диск к `/data`, иначе база и фото пропадут при перезапуске. После первого запуска выполните `npm run seed` с `API_URL=<адрес сайта>`, чтобы появились демо-дни.

## Что где лежит
`src/engine` — логика «текст + фото + песня → сцена», `src/routes` — API, `public` — сайт, `test` — тесты движка (`npm test`).
