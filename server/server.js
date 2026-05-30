import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { RoomManager } from "./roomManager.js";
import { normalizeBallSpeedKey } from "./gameEngine.js";

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "127.0.0.1";
const rooms = new RoomManager();

function sendError(ws, message) {
    rooms.send(ws, { type: "error", message });
}

function handleMessage(ws, rawMessage) {
    let message;
    try {
        message = JSON.parse(rawMessage);
    } catch {
        sendError(ws, "Некорректное сообщение");
        return;
    }

    const type = message.type;

    if (type === "startSolo") {
        const playerName = String(message.playerName || "Player");
        const ballSpeed = normalizeBallSpeedKey(message.ballSpeed);
        const room = rooms.startSolo(ws, playerName, ballSpeed);
        if (!room) {
            sendError(ws, "Не удалось запустить одиночную игру");
        }
        return;
    }

    if (type === "createRoom") {
        const playerName = String(message.playerName || "Player");
        const gameMode = String(message.gameMode || "coop");
        if (gameMode === "solo") {
            sendError(ws, "Для одиночной игры используйте startSolo");
            return;
        }
        const ballSpeed = normalizeBallSpeedKey(message.ballSpeed);
        const room = rooms.createRoom(playerName, gameMode, ballSpeed);
        rooms.addPlayer(room, ws, playerName, 0);

        rooms.send(ws, {
            type: "roomCreated",
            roomId: room.id,
            slot: 0,
            playerName,
            players: rooms.getPlayersList(room),
            settings: rooms.getRoomSettings(room),
        });

        rooms.maybeStartCountdown(room);
        return;
    }

    if (type === "joinRoom") {
        const roomId = String(message.roomId || "").toUpperCase();
        const playerName = String(message.playerName || "Player");
        const room = rooms.getRoom(roomId);

        if (!room) {
            sendError(ws, "Комната не найдена");
            return;
        }

        if (room.gameMode === "solo") {
            sendError(ws, "Это одиночная комната");
            return;
        }

        if (room.players.has(1) && room.players.get(1)?.connected) {
            sendError(ws, "Комната уже заполнена");
            return;
        }

        rooms.addPlayer(room, ws, playerName, 1);

        rooms.send(ws, {
            type: "roomJoined",
            roomId: room.id,
            slot: 1,
            playerName,
            players: rooms.getPlayersList(room),
            settings: rooms.getRoomSettings(room),
        });

        rooms.broadcast(
            room,
            {
                type: "roomUpdate",
                roomId: room.id,
                players: rooms.getPlayersList(room),
                status: room.status,
                settings: rooms.getRoomSettings(room),
                message: playerName + " присоединился",
            },
            ws
        );

        rooms.maybeStartCountdown(room);
        return;
    }

    const room = rooms.findRoomBySocket(ws);
    if (!room) {
        if (type === "input") {
            return;
        }
        sendError(ws, "Вы не в комнате");
        return;
    }

    const slot = rooms.getPlayerSlot(room, ws);
    if (slot === null) {
        sendError(ws, "Игрок не найден");
        return;
    }

    if (type === "updateSettings") {
        if (slot !== 0) {
            sendError(ws, "Менять настройки может только создатель комнаты");
            return;
        }

        if (!rooms.updateSettings(room, message.ballSpeed)) {
            sendError(ws, "Настройки можно менять только до старта");
        }
        return;
    }

    if (type === "input") {
        if (room.status !== "playing") {
            return;
        }

        rooms.setInput(room, slot, {
            move: Number(message.move) || 0,
            launchBall: Boolean(message.launchBall),
        });
        return;
    }

    if (type === "continue") {
        if (room.gameState?.status === "levelup") {
            room.gameState.status = "playing";
            room.gameState.message = "";
            rooms.broadcastGameState(room);
        }
        return;
    }

    if (type === "surrender") {
        if (!rooms.surrender(room, slot)) {
            sendError(ws, "Сейчас нельзя сдаться");
        }
        return;
    }

    if (type === "restart") {
        if (room.status !== "gameover") {
            return;
        }

        const connected = [...room.players.values()].filter((player) => player.connected);
        if (connected.length < rooms.requiredPlayers(room)) {
            room.status = "waiting";
            room.gameState = null;
            rooms.broadcast(room, {
                type: "roomUpdate",
                roomId: room.id,
                players: rooms.getPlayersList(room),
                status: "waiting",
                settings: rooms.getRoomSettings(room),
                message:
                    room.gameMode === "solo"
                        ? "Нажмите «Начать игру»"
                        : "Ожидание второго игрока",
            });
            return;
        }

        rooms.startGame(room);
        return;
    }

    sendError(ws, "Неизвестная команда");
}

const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Arkanoid WebSocket server");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
    ws.on("message", (data) => {
        handleMessage(ws, data.toString());
    });

    ws.on("close", () => {
        rooms.removePlayer(ws);
    });
});

server.listen(PORT, HOST, () => {
    console.log(
        "Arkanoid WebSocket server listening on " + HOST + ":" + PORT + " (proxy via Apache /ws)",
    );
});
