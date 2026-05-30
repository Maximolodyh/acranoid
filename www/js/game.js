(() => {
    "use strict";

    const API_URL = "/api/scores.php";

    const MODE_LABELS = {
        solo: "Solo",
        coop: "Duo (кооп)",
        versus: "Versus",
    };

    const SPEED_LABELS = {
        easy: "Easy (1 блок/сек)",
        medium: "Medium (2 блока/сек)",
        hard: "Hard (3 блока/сек)",
    };

    const canvas = document.getElementById("gameCanvas");
    const ctx = canvas.getContext("2d");

    const modeSelect = document.getElementById("modeSelect");
    const lobby = document.getElementById("lobby");
    const waitingRoom = document.getElementById("waitingRoom");
    const lobbyModeTitle = document.getElementById("lobbyModeTitle");
    const lobbyModeHint = document.getElementById("lobbyModeHint");
    const roomCodeLabel = document.getElementById("roomCodeLabel");
    const roomSettingsLabel = document.getElementById("roomSettingsLabel");
    const waitingMessage = document.getElementById("waitingMessage");
    const playersList = document.getElementById("playersList");
    const countdownLabel = document.getElementById("countdownLabel");
    const lobbyStatus = document.getElementById("lobbyStatus");
    const playerNameInput = document.getElementById("playerNameInput");
    const roomCodeInput = document.getElementById("roomCodeInput");
    const createRoomButton = document.getElementById("createRoomButton");
    const joinRoomButton = document.getElementById("joinRoomButton");
    const quickJoinNameInput = document.getElementById("quickJoinNameInput");
    const quickJoinCodeInput = document.getElementById("quickJoinCodeInput");
    const quickJoinButton = document.getElementById("quickJoinButton");
    const modeSelectStatus = document.getElementById("modeSelectStatus");
    const startSoloButton = document.getElementById("startSoloButton");
    const backToModesButton = document.getElementById("backToModesButton");
    const multiplayerActions = document.getElementById("multiplayerActions");
    const soloActions = document.getElementById("soloActions");
    const speedOptions = document.getElementById("speedOptions");
    const speedHint = document.getElementById("speedHint");
    const controlsHelp = document.getElementById("controlsHelp");

    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlayTitle");
    const overlayMessage = document.getElementById("overlayMessage");
    const startButton = document.getElementById("startButton");
    const launchBallButton = document.getElementById("launchBallButton");
    const surrenderButton = document.getElementById("surrenderButton");
    const sessionInfo = document.getElementById("sessionInfo");
    const scoreList = document.getElementById("scoreList");

    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;
    const PADDLE_HEIGHT = 16;
    const PADDLE_Y_BOTTOM = HEIGHT - 40;
    const PADDLE_Y_TOP = 24;
    const PADDLE_COLORS = ["#7dd3fc", "#f472b6"];
    const BALL_COLORS = ["#7dd3fc", "#f472b6"];

    const keys = new Set();
    let socket = null;
    let mySlot = null;
    let roomId = null;
    let selectedMode = null;
    let roomSettings = null;
    let latestState = null;
    let overlayMode = null;
    let inWaitingRoom = false;
    let pendingSurrender = false;
    let sessionActive = false;

    const inputState = {
        move: 0,
        launchBall: false,
    };

    function getPlayerName() {
        const lobbyName = playerNameInput.value.trim();
        const quickName = quickJoinNameInput.value.trim();
        return lobbyName || quickName || "Player";
    }

    function getSelectedBallSpeed() {
        const checked = document.querySelector('input[name="ballSpeed"]:checked');
        return checked ? checked.value : "easy";
    }

    function setSelectedBallSpeed(value) {
        const input = document.querySelector('input[name="ballSpeed"][value="' + value + '"]');
        if (input) {
            input.checked = true;
        }
    }

    function setSpeedControlsEnabled(enabled) {
        speedOptions.querySelectorAll("input").forEach((input) => {
            input.disabled = !enabled;
        });
    }

    function formatSettings(settings) {
        if (!settings) {
            return "";
        }
        return MODE_LABELS[settings.gameMode] + " · " + SPEED_LABELS[settings.ballSpeed];
    }

    function setLobbyStatus(message, isError = false) {
        lobbyStatus.textContent = message;
        lobbyStatus.classList.toggle("error", isError);
    }

    function setModeSelectStatus(message, isError = false) {
        modeSelectStatus.textContent = message;
        modeSelectStatus.classList.toggle("error", isError);
    }

    function clearAllStatuses() {
        setLobbyStatus("");
        setModeSelectStatus("");
    }

    function showModeSelect() {
        modeSelect.classList.remove("hidden");
        lobby.classList.add("hidden");
        waitingRoom.classList.add("hidden");
        canvas.classList.add("hidden");
        launchBallButton.classList.add("hidden");
        surrenderButton.classList.add("hidden");
        inWaitingRoom = false;
        updateSessionInfo("Выберите режим или введите код комнаты");
    }

    function showLobbyConfig() {
        modeSelect.classList.add("hidden");
        lobby.classList.remove("hidden");
        waitingRoom.classList.add("hidden");
        canvas.classList.add("hidden");
        inWaitingRoom = false;
        setSpeedControlsEnabled(true);
    }

    function showWaitingRoom() {
        modeSelect.classList.add("hidden");
        lobby.classList.add("hidden");
        waitingRoom.classList.remove("hidden");
        canvas.classList.add("hidden");
        inWaitingRoom = true;
    }

    function showGame() {
        modeSelect.classList.add("hidden");
        lobby.classList.add("hidden");
        waitingRoom.classList.add("hidden");
        canvas.classList.remove("hidden");
        inWaitingRoom = false;
    }

    function returnToMainMenu() {
        pendingSurrender = false;
        sessionActive = false;
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.close();
        }
        socket = null;
        roomId = null;
        mySlot = null;
        latestState = null;
        roomSettings = null;
        hideOverlay();
        launchBallButton.classList.add("hidden");
        surrenderButton.classList.add("hidden");
        setSpeedControlsEnabled(true);
        showModeSelect();
    }

    function showOverlay(title, message, mode) {
        overlayMode = mode;
        overlayTitle.textContent = title;
        overlayMessage.textContent = message;
        if (mode === "menu") {
            startButton.textContent = "В главное меню";
        } else {
            startButton.textContent = mode === "gameover" ? "Сохранить и заново" : "Продолжить";
        }
        overlay.classList.remove("hidden");
    }

    function hideOverlay() {
        overlay.classList.add("hidden");
        overlayMode = null;
    }

    function updateSessionInfo(text) {
        sessionInfo.textContent = text;
    }

    function updateControlsHelp(mode) {
        if (mode === "versus") {
            controlsHelp.innerHTML =
                "<li><kbd>←</kbd> <kbd>→</kbd> или <kbd>A</kbd> <kbd>D</kbd> — ваша платформа</li>" +
                "<li>Игрок 1 (синий) снизу, игрок 2 (красный) сверху</li>" +
                "<li>Блоки по центру между платформами</li>" +
                "<li>Красная стенка снизу: отскок красного мяча, потеря жизни у синего</li>" +
                "<li>Синяя стенка сверху: отскок синего мяча, потеря жизни у красного</li>" +
                "<li>У каждого свой цветной мяч</li>" +
                "<li>Очки за блоки — по цвету мяча</li>" +
                "<li><kbd>Space</kbd> или кнопка — пуск своего мяча</li>" +
                "<li>«Сдаться» — выход в главное меню</li>";
            return;
        }

        if (mode === "coop") {
            controlsHelp.innerHTML =
                "<li><kbd>←</kbd> <kbd>→</kbd> или <kbd>A</kbd> <kbd>D</kbd> — ваша платформа</li>" +
                "<li>Две платформы снизу, общий счёт и жизни</li>" +
                "<li><kbd>Space</kbd> или кнопка — пуск мяча</li>" +
                "<li>«Сдаться» — выход в главное меню</li>";
            return;
        }

        controlsHelp.innerHTML =
            "<li><kbd>←</kbd> <kbd>→</kbd> или <kbd>A</kbd> <kbd>D</kbd> — платформа</li>" +
            "<li><kbd>Space</kbd> или кнопка — пуск мяча</li>" +
            "<li>«Сдаться» — выход в главное меню</li>";
    }

    function configureLobbyForMode(mode) {
        selectedMode = mode;

        if (quickJoinNameInput.value.trim() && !playerNameInput.value.trim()) {
            playerNameInput.value = quickJoinNameInput.value.trim();
        }

        lobbyModeTitle.textContent = MODE_LABELS[mode];
        updateControlsHelp(mode);

        if (mode === "solo") {
            lobbyModeHint.textContent = "Одиночная игра. Выберите скорость мяча и нажмите «Начать игру».";
            multiplayerActions.classList.add("hidden");
            soloActions.classList.remove("hidden");
            return;
        }

        if (mode === "coop") {
            lobbyModeHint.textContent = "Создайте комнату или подключитесь по коду. Играйте вместе против блоков.";
        } else {
            lobbyModeHint.textContent =
                "Создайте комнату или подключитесь по коду. Два игрока: один снизу, другой сверху.";
        }

        multiplayerActions.classList.remove("hidden");
        soloActions.classList.add("hidden");
    }

    function renderPlayersList(players) {
        playersList.innerHTML = "";
        players.forEach((player) => {
            const item = document.createElement("li");
            if (!player.name) {
                item.textContent = "Игрок " + (player.slot + 1) + ": ожидание...";
                item.className = "empty";
            } else {
                item.textContent =
                    "Игрок " + (player.slot + 1) + ": " + player.name + (player.connected ? "" : " (offline)");
            }
            playersList.appendChild(item);
        });
    }

    function connectWebSocket(onOpen) {
        if (socket && socket.readyState <= 1) {
            socket.close();
        }

        socket = new WebSocket(getWebSocketUrl());

        socket.addEventListener("open", () => {
            clearAllStatuses();
            onOpen();
        });

        socket.addEventListener("message", (event) => {
            handleServerMessage(JSON.parse(event.data));
        });

        socket.addEventListener("close", () => {
            updateSessionInfo("Соединение потеряно");
            launchBallButton.classList.add("hidden");
            surrenderButton.classList.add("hidden");
            setLobbyStatus("Соединение с сервером потеряно", true);
            setModeSelectStatus("Соединение с сервером потеряно", true);
            setSpeedControlsEnabled(true);
        });

        socket.addEventListener("error", () => {
            setLobbyStatus("Не удалось подключиться к игровому серверу", true);
            setModeSelectStatus("Не удалось подключиться к игровому серверу", true);
        });
    }

    function send(message) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    }

    function createRoomPayload() {
        return {
            type: "createRoom",
            playerName: getPlayerName(),
            gameMode: selectedMode,
            ballSpeed: getSelectedBallSpeed(),
        };
    }

    function handleGameState(state) {
        latestState = state;
        sessionActive = true;
        if (state.mode === "solo") {
            mySlot = 0;
        }
        if (state.mode) {
            updateControlsHelp(state.mode);
        }
        showGame();

        if (state.status === "gameover") {
            handleGameOver(state);
            updateGameActionButtons();
            return;
        }

        if (state.status === "levelup") {
            if (overlayMode !== "levelup") {
                showOverlay("Новый уровень", state.message || "Готовы?", "levelup");
            }
            updateGameActionButtons();
            return;
        }

        hideOverlay();
        updateGameActionButtons();
    }

    function buildSurrenderMessage(state) {
        if (state.mode === "versus" && state.winner === mySlot) {
            return "Противник сдался. Вы победили!";
        }
        if (state.surrenderedBy === mySlot) {
            return "Вы сдались";
        }
        return state.message || "Матч прерван";
    }

    function handleGameOver(state) {
        if (state.surrenderedBy !== null && state.surrenderedBy !== undefined) {
            if (state.surrenderedBy === mySlot || pendingSurrender) {
                pendingSurrender = false;
                returnToMainMenu();
                return;
            }

            showOverlay(
                state.mode === "versus" ? "Победа!" : "Игра завершена",
                buildSurrenderMessage(state),
                "menu"
            );
            return;
        }

        showOverlay(
            state.mode === "versus" ? "Матч окончен" : "Игра окончена",
            buildGameOverMessage(state),
            "gameover"
        );
    }

    function handleServerMessage(message) {
        switch (message.type) {
            case "soloStarted":
                sessionActive = true;
                mySlot = message.slot;
                roomSettings = message.settings;
                roomId = null;
                updateSessionInfo(formatSettings(roomSettings) + " · Solo");
                handleGameState(message.state);
                break;

            case "matchEnded":
                latestState = message.state;
                pendingSurrender = false;
                handleGameOver(message.state);
                updateGameActionButtons();
                break;

            case "roomCreated":
                sessionActive = false;
                roomId = message.roomId;
                mySlot = message.slot;
                roomSettings = message.settings;
                roomCodeLabel.textContent = roomId;
                roomSettingsLabel.textContent = formatSettings(roomSettings);
                renderPlayersList(message.players);
                updateSessionInfo(formatSettings(roomSettings) + " · комната " + roomId);
                waitingMessage.textContent = "Сообщите код второму игроку и ждите подключения.";
                showWaitingRoom();
                setSpeedControlsEnabled(mySlot === 0);
                break;

            case "roomJoined":
                sessionActive = false;
                roomId = message.roomId;
                mySlot = message.slot;
                roomSettings = message.settings;
                roomCodeLabel.textContent = roomId;
                roomSettingsLabel.textContent = formatSettings(roomSettings);
                waitingMessage.textContent = "Подключение успешно. Скоро начнётся игра.";
                renderPlayersList(message.players);
                updateSessionInfo(formatSettings(roomSettings) + " · вы игрок " + (mySlot + 1));
                showWaitingRoom();
                setSpeedControlsEnabled(false);
                setSelectedBallSpeed(roomSettings.ballSpeed);
                break;

            case "roomUpdate":
                if (message.settings) {
                    roomSettings = message.settings;
                    roomSettingsLabel.textContent = formatSettings(roomSettings);
                    setSelectedBallSpeed(roomSettings.ballSpeed);
                }
                renderPlayersList(message.players);
                if (message.message) {
                    waitingMessage.textContent = message.message;
                }
                countdownLabel.classList.add("hidden");
                if (message.status === "waiting") {
                    showWaitingRoom();
                    setSpeedControlsEnabled(mySlot === 0);
                }
                break;

            case "countdown":
                countdownLabel.classList.remove("hidden");
                countdownLabel.textContent = "Старт через " + message.seconds + "...";
                waitingMessage.textContent = "Оба игрока на месте.";
                showWaitingRoom();
                break;

            case "gameState":
                handleGameState(message.state);
                break;

            case "error":
                if (modeSelect.classList.contains("hidden")) {
                    setLobbyStatus(message.message, true);
                } else {
                    setModeSelectStatus(message.message, true);
                }
                break;

            default:
                break;
        }
    }

    function buildGameOverMessage(state) {
        if (state.mode === "versus") {
            const p1 = state.scores?.[0] ?? 0;
            const p2 = state.scores?.[1] ?? 0;
            return (state.message || "Матч завершён") + " · Счёт: " + p1 + " : " + p2;
        }
        return "Общий счёт: " + state.score;
    }

    function getScoreForSaving(state) {
        if (state.mode === "versus") {
            return state.scores?.[mySlot] ?? 0;
        }
        return state.score ?? 0;
    }

    function updateLaunchButton() {
        if (!latestState || mySlot === null) {
            launchBallButton.classList.add("hidden");
            return;
        }

        let canLaunch = false;

        if (state.mode === "versus" && state.balls) {
            const ball = state.balls[mySlot];
            canLaunch = Boolean(ball?.attached && ball.owner === mySlot);
        } else if (latestState.ball) {
            canLaunch =
                latestState.mode === "solo"
                    ? latestState.ball.attached
                    : latestState.ball.attached && latestState.ball.attachedTo === mySlot;
        }

        launchBallButton.classList.toggle("hidden", !canLaunch);
    }

    function updateGameActionButtons() {
        const inActiveGame =
            latestState &&
            !canvas.classList.contains("hidden") &&
            latestState.status !== "gameover";

        surrenderButton.classList.toggle("hidden", !inActiveGame);

        if (inActiveGame) {
            updateLaunchButton();
        } else {
            launchBallButton.classList.add("hidden");
        }
    }

    function currentMoveInput() {
        let move = 0;
        if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) {
            move -= 1;
        }
        if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) {
            move += 1;
        }
        return move;
    }

    function sendInput() {
        if (!sessionActive || mySlot === null || !socket || socket.readyState !== WebSocket.OPEN) {
            return;
        }

        const move = currentMoveInput();
        const launchBall =
            inputState.launchBall ||
            keys.has(" ") ||
            keys.has("Spacebar");

        if (move !== inputState.move || launchBall) {
            send({
                type: "input",
                move,
                launchBall,
            });
        }

        inputState.move = move;
        inputState.launchBall = false;
    }

    function getPaddleY(mode, index) {
        if (mode === "versus" && index === 1) {
            return PADDLE_Y_TOP;
        }
        return PADDLE_Y_BOTTOM;
    }

    function roundRect(x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    function drawBackground() {
        const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
        gradient.addColorStop(0, "#0a1020");
        gradient.addColorStop(1, "#04060d");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    function drawVersusWalls(walls) {
        if (!walls) {
            return;
        }

        if (walls.blueWall) {
            ctx.fillStyle = walls.blueWall.color;
            ctx.fillRect(0, walls.blueWall.y, WIDTH, walls.blueWall.height);
        }

        if (walls.redWall) {
            ctx.fillStyle = walls.redWall.color;
            ctx.fillRect(0, walls.redWall.y, WIDTH, walls.redWall.height);
        }
    }

    function drawState(state) {
        drawBackground();

        if (state.mode === "versus") {
            drawVersusWalls(state.walls);
        }

        state.bricks.forEach((brick) => {
            if (!brick.alive) {
                return;
            }
            ctx.fillStyle = brick.color;
            roundRect(brick.x, brick.y, brick.width, brick.height, 6);
            ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,0.25)";
            ctx.stroke();
        });

        state.paddles.forEach((paddle, index) => {
            const paddleY = getPaddleY(state.mode, index);
            const gradient = ctx.createLinearGradient(paddle.x, paddleY, paddle.x, paddleY + PADDLE_HEIGHT);
            gradient.addColorStop(0, PADDLE_COLORS[index] || PADDLE_COLORS[0]);
            gradient.addColorStop(1, index === 0 ? "#0284c7" : "#db2777");
            ctx.fillStyle = gradient;
            roundRect(paddle.x, paddleY, paddle.width, PADDLE_HEIGHT, 8);
            ctx.fill();

            if (index === mySlot) {
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.lineWidth = 1;
            }
        });

        const balls = state.mode === "versus" ? state.balls || [] : state.ball ? [state.ball] : [];

        balls.forEach((ball) => {
            if (!ball) {
                return;
            }

            ctx.beginPath();
            ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
            ctx.fillStyle = ball.color || BALL_COLORS[ball.owner || 0] || "#ffffff";
            if (ball.attached) {
                ctx.globalAlpha = 0.75;
            }
            ctx.fill();
            ctx.globalAlpha = 1;

            if (state.mode === "versus") {
                ctx.strokeStyle = ball.owner === mySlot ? "#ffffff" : "rgba(255,255,255,0.45)";
                ctx.lineWidth = ball.owner === mySlot ? 2 : 1;
                ctx.stroke();
                ctx.lineWidth = 1;
            }

            ctx.closePath();
        });

        ctx.fillStyle = "#dbeafe";
        ctx.font = "18px Segoe UI, sans-serif";

        if (state.mode === "versus") {
            ctx.fillStyle = BALL_COLORS[0];
            ctx.fillText("P1: " + (state.scores?.[0] ?? 0) + "  (" + (state.livesPerPlayer?.[0] ?? 0) + " жизней)", 20, 30);
            ctx.fillStyle = BALL_COLORS[1];
            ctx.fillText("P2: " + (state.scores?.[1] ?? 0) + "  (" + (state.livesPerPlayer?.[1] ?? 0) + " жизней)", 20, 56);
            ctx.fillStyle = "#dbeafe";
            ctx.fillText("Скорость: " + (SPEED_LABELS[state.ballSpeed] || state.ballSpeed), 420, 30);
        } else {
            ctx.fillText("Счёт: " + state.score, 20, 30);
            ctx.fillText("Жизни: " + state.lives, 160, 30);
            ctx.fillText("Уровень: " + state.level, 300, 30);
            ctx.fillText("Скорость: " + (SPEED_LABELS[state.ballSpeed] || state.ballSpeed), 460, 30);
        }

        if (state.players && state.mode !== "solo") {
            ctx.fillText(
                "P1: " + (state.players[0]?.name || "-") + "   P2: " + (state.players[1]?.name || "-"),
                20,
                state.mode === "versus" ? 82 : 56
            );
        }
    }

    function renderLoop() {
        if (latestState && !canvas.classList.contains("hidden")) {
            drawState(latestState);
            sendInput();
        }
        requestAnimationFrame(renderLoop);
    }

    async function loadScores() {
        try {
            const response = await fetch(API_URL);
            if (!response.ok) {
                throw new Error("Failed to load scores");
            }

            const scores = await response.json();
            scoreList.innerHTML = "";

            if (!scores.length) {
                const item = document.createElement("li");
                item.className = "empty";
                item.textContent = "Пока нет рекордов";
                scoreList.appendChild(item);
                return;
            }

            scores.forEach((entry) => {
                const item = document.createElement("li");
                item.textContent = entry.playerName + " — " + entry.score;
                scoreList.appendChild(item);
            });
        } catch (error) {
            scoreList.innerHTML = "<li class=\"empty\">Сервер недоступен</li>";
        }
    }

    async function saveScore() {
        if (!latestState) {
            return;
        }

        const playerName = getPlayerName();
        try {
            await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    playerName,
                    score: getScoreForSaving(latestState),
                }),
            });
            await loadScores();
        } catch (error) {
            console.error(error);
        }
    }

    function joinRoomByCode(code) {
        const trimmedCode = code.trim().toUpperCase();
        if (!trimmedCode) {
            setLobbyStatus("Введите код комнаты", true);
            setModeSelectStatus("Введите код комнаты", true);
            return;
        }

        clearAllStatuses();

        beginConnection(() => {
            send({
                type: "joinRoom",
                roomId: trimmedCode,
                playerName: getPlayerName(),
            });
        });
    }

    modeSelect.querySelectorAll(".mode-card").forEach((button) => {
        button.addEventListener("click", () => {
            configureLobbyForMode(button.dataset.mode);
            showLobbyConfig();
            clearAllStatuses();
        });
    });

    backToModesButton.addEventListener("click", () => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.close();
        }
        roomId = null;
        mySlot = null;
        latestState = null;
        showModeSelect();
    });

    speedOptions.addEventListener("change", () => {
        const speed = getSelectedBallSpeed();
        speedHint.textContent =
            speed === "easy"
                ? "Easy — 1 ширина блока в секунду."
                : speed === "medium"
                  ? "Medium — 2 ширины блока в секунду."
                  : "Hard — 3 ширины блока в секунду.";

        if (inWaitingRoom && mySlot === 0 && roomId) {
            send({
                type: "updateSettings",
                ballSpeed: speed,
            });
        }
    });

    function beginConnection(onOpen) {
        sessionActive = false;
        latestState = null;
        mySlot = null;
        hideOverlay();
        connectWebSocket(onOpen);
    }

    createRoomButton.addEventListener("click", () => {
        beginConnection(() => {
            send(createRoomPayload());
        });
    });

    startSoloButton.addEventListener("click", () => {
        beginConnection(() => {
            send({
                type: "startSolo",
                playerName: getPlayerName(),
                ballSpeed: getSelectedBallSpeed(),
            });
        });
    });

    joinRoomButton.addEventListener("click", () => {
        joinRoomByCode(roomCodeInput.value);
    });

    quickJoinButton.addEventListener("click", () => {
        joinRoomByCode(quickJoinCodeInput.value);
    });

    quickJoinCodeInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            joinRoomByCode(quickJoinCodeInput.value);
        }
    });

    roomCodeInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            joinRoomByCode(roomCodeInput.value);
        }
    });

    launchBallButton.addEventListener("click", () => {
        inputState.launchBall = true;
        sendInput();
        updateLaunchButton();
    });

    surrenderButton.addEventListener("click", () => {
        if (!window.confirm("Завершить игру и вернуться в главное меню?")) {
            return;
        }
        pendingSurrender = true;
        send({ type: "surrender" });
    });

    startButton.addEventListener("click", async () => {
        if (overlayMode === "menu") {
            returnToMainMenu();
            return;
        }

        if (overlayMode === "gameover") {
            await saveScore();
            send({ type: "restart" });
            hideOverlay();
            return;
        }

        if (overlayMode === "levelup") {
            send({ type: "continue" });
        }

        hideOverlay();
    });

    window.addEventListener("keydown", (event) => {
        keys.add(event.key);
        if (event.key === " ") {
            event.preventDefault();
            inputState.launchBall = true;
        }
    });

    window.addEventListener("keyup", (event) => {
        keys.delete(event.key);
    });

    speedHint.textContent = "Easy — 1 ширина блока в секунду.";
    loadScores();
    renderLoop();
})();
