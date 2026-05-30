# Arkanoid — развёртывание на Debian 12

Веб-игра Arkanoid с режимами **Solo**, **Duo (кооп)** и **Versus**, а также настройкой скорости мяча (Easy / Medium / Hard).

- **Apache (порт 80 или 443)** — статика, PHP API рекордов и прокси WebSocket на путь `/ws`
- **Node.js** — игровой сервер только на `127.0.0.1:3001` (снаружи не открывается)

## Необходимые пакеты

```bash
sudo apt update
sudo apt install apache2 libapache2-mod-php php-json nodejs npm
```

| Пакет | Зачем |
|-------|-------|
| `apache2` | Раздача HTML/CSS/JS и PHP |
| `libapache2-mod-php` | API рекордов |
| `php-json` | JSON в PHP |
| `nodejs` | WebSocket-сервер игры |
| `npm` | Установка зависимостей сервера |

## 1. Установка веб-части (Apache)

```bash
sudo cp -r www/* /var/www/html/
sudo chown -R www-data:www-data /var/www/html
sudo chmod 775 /var/www/html/data
sudo chmod 664 /var/www/html/data/scores.json
sudo systemctl enable apache2
sudo systemctl start apache2
```

Игра открывается по адресу: `http://IP-сервера/` (или `https://` при TLS).

### Прокси WebSocket на том же порту (обязательно)

Клиент подключается к `ws://IP/ws` или `wss://IP/ws` — **без отдельного порта 3001**.

```bash
sudo cp deploy/apache-arkanoid-ws.conf /etc/apache2/conf-available/arkanoid-ws.conf
sudo a2enmod proxy proxy_http proxy_wstunnel
sudo a2enconf arkanoid-ws
sudo systemctl reload apache2
```

В firewall достаточно **80/tcp** (и **443/tcp** при HTTPS). Порт **3001 наружу не открывать**.

## 2. Установка игрового сервера (WebSocket)

```bash
sudo mkdir -p /opt/arkanoid-server
sudo cp -r server/* /opt/arkanoid-server/
cd /opt/arkanoid-server
sudo npm install --production
```

### Systemd-сервис

```bash
sudo cp /opt/arkanoid-server/arkanoid-game.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable arkanoid-game
sudo systemctl start arkanoid-game
sudo systemctl status arkanoid-game
```

Сервер слушает только **127.0.0.1:3001**; Apache проксирует `/ws` на него.

## 3. Режимы игры

| Режим | Описание |
|-------|----------|
| **Solo** | Один игрок, классический Arkanoid |
| **Duo** | 2 игрока вместе, две платформы снизу, общий счёт и жизни |
| **Versus** | 2 игрока: платформы **сверху и снизу**, у каждого **свой цветной мяч**. Блоки по центру поля. Красная стенка снизу (отражает красный мяч, синий теряет жизнь), синяя стенка сверху (наоборот). Очки за блоки — владельцу мяча |

### Скорость мяча (настройка комнаты)

| Уровень | Скорость |
|---------|----------|
| Easy | 1 ширина блока / сек |
| Medium | 2 ширины блока / сек |
| Hard | 3 ширины блока / сек |

Создатель комнаты выбирает скорость до старта игры и может изменить её в лобби, пока ждёт второго игрока.

## 4. Как играть

1. Выберите режим: **Solo**, **Duo** или **Versus**
2. Выберите скорость мяча: **Easy**, **Medium** или **Hard**
3. **Solo** — нажмите «Начать игру»
4. **Duo / Versus** — создайте комнату или войдите по коду с другого компьютера
5. **Быстрый вход** — на главном экране можно ввести код комнаты сразу, без выбора режима
6. Когда мяч на вашей платформе — **Space** или кнопка **«Пуск мяча»**

## Управление

| Действие | Клавиши |
|----------|---------|
| Движение платформы | `←` `→` или `A` `D` |
| Пуск мяча | `Space` или кнопка «Пуск мяча» |

## Структура проекта

```
arkanoid-web/
├── www/                     → копируется в /var/www/html
│   ├── index.html
│   ├── css/style.css
│   ├── js/config.js
│   ├── js/game.js
│   └── api/scores.php
├── deploy/
│   └── apache-arkanoid-ws.conf → прокси /ws для Apache
└── server/                  → копируется в /opt/arkanoid-server
    ├── server.js
    ├── gameEngine.js
    ├── roomManager.js
    ├── package.json
    └── arkanoid-game.service
```

## WebSocket (один порт с сайтом)

По умолчанию: тот же хост и порт, что у страницы, путь **`/ws`**.

| Сайт | WebSocket |
|------|-----------|
| `http://example.com/` | `ws://example.com/ws` |
| `https://example.com/` | `wss://example.com/ws` |

Переопределение в `index.html` перед `config.js`:

```html
<script>
  // другой путь на том же хосте:
  // window.ARKANOID_WS_PATH = "/game/ws";
  // прямое подключение без Apache (только для разработки):
  // window.ARKANOID_WS_URL = "ws://127.0.0.1:3001";
</script>
```

## Проверка

```bash
# Apache + PHP
curl http://localhost/api/scores.php

# Node (только на сервере, localhost)
curl http://127.0.0.1:3001

# Прокси /ws (нужен модуль wstunnel; для полной проверки — браузер F12 → Network → WS)
sudo systemctl status arkanoid-game apache2
```

## Локальная разработка

**Вариант A — как на сервере (рекомендуется):** Apache + прокси `/ws` + Node на 127.0.0.1:3001.

**Вариант B — без Apache:** перед `config.js` задайте прямой URL:

```html
<script>window.ARKANOID_WS_URL = "ws://127.0.0.1:3001";</script>
```

```bash
# Терминал 1
cd server && npm install && npm start

# Терминал 2
cd www && php -S localhost:8080
# http://localhost:8080
```

## Научное описание проекта (DOCX)

В каталоге `docs/` скрипт формирует **Курсовая_Arkanoid_Web.docx** (оформление как курсовая: титул, введение, главы 1–3, заключение). Реквизиты вуза — в `coursework_config.py`.

```bash
cd docs
pip install python-docx
python generate_scientific_doc.py
```

На Windows можно запустить `docs\generate_doc.bat`.

## API рекордов

- `GET /api/scores.php` — топ-10
- `POST /api/scores.php` — сохранить результат после game over

После проигрыша нажмите «Сохранить и заново» — счёт попадёт в таблицу.

## Если не подключается второй игрок

1. Проверьте `arkanoid-game` и Apache: `sudo systemctl status arkanoid-game apache2`
2. Включён прокси: `sudo a2enconf arkanoid-ws` и `a2enmod proxy_wstunnel`
3. В firewall открыт **80** (или **443**), не 3001
4. Оба игрока используют один и тот же URL сайта (тот же origin для `/ws`)
5. В консоли браузера (F12) WebSocket идёт на `ws(s)://…/ws`, без `:3001`
