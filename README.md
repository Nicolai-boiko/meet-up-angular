# MeetUp

Платформа для видеоконференций, планирования встреч и обмена полезными материалами.

- Видеокомнаты на WebRTC, чат и демонстрация экрана
- Расписание встреч с повторениями и экспортом в ICS
- Библиотека материалов с тегами, файлами и избранным
- Админ-панель со статистикой

**Стек:** Angular 22, Angular Material, Express 5, PostgreSQL, Prisma, Socket.IO.

## Запуск

```sh
docker compose up -d
cp meetup-backend/.env.example meetup-backend/.env

cd meetup-backend
npm install
npx prisma migrate deploy
npm run dev

cd ../frontend
npm install
npm start
```

Если порт 5432 уже занят локальным PostgreSQL, поднимите контейнер на другом порту
и укажите его в `DATABASE_URL`:

```sh
DB_PORT=5433 docker compose up -d
```

Каталоги `meetup-backend/uploads/avatars` и `uploads/files` создаются при старте backend.
