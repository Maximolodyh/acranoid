import { randomBytes } from "node:crypto";
import {
    TICK_MS,
    createGameState,
    applyInput,
    tickGame,
    serializeState,
    normalizeBallSpeedKey,
    applySurrender,
} from "./gameEngine.js";

function makeRoomId() {
    return randomBytes(3).toString("hex").toUpperCase();
}

function normalizeMode(mode) {
    if (mode === "solo" || mode === "versus") {
        return mode;
    }
    return "coop";
}

export class RoomManager {
    constructor() {
        this.rooms = new Map();
    }

    createRoom(playerName, gameMode = "coop", ballSpeed = "easy") {
        const roomId = makeRoomId();
        const room = {
            id: roomId,
            gameMode: normalizeMode(gameMode),
            ballSpeed: normalizeBallSpeedKey(ballSpeed),
            players: new Map(),
            gameState: null,
            countdown: null,
            interval: null,
            inputs: [{ move: 0, launchBall: false }, { move: 0, launchBall: false }],
            status: "waiting",
        };

        this.rooms.set(roomId, room);
        return room;
    }

    getRoom(roomId) {
        return this.rooms.get(String(roomId || "").toUpperCase()) ?? null;
    }

    addPlayer(room, ws, playerName, slot) {
        room.players.set(slot, {
            ws,
            name: playerName.trim() || "Player",
            slot,
            connected: true,
        });
    }

    findRoomBySocket(ws) {
        for (const room of this.rooms.values()) {
            for (const player of room.players.values()) {
                if (player.ws === ws) {
                    return room;
                }
            }
        }
        return null;
    }

    getPlayerSlot(room, ws) {
        for (const [slot, player] of room.players.entries()) {
            if (player.ws === ws) {
                return slot;
            }
        }
        return null;
    }

    getPlayersList(room) {
        const slots = room.gameMode === "solo" ? [0] : [0, 1];
        return slots.map((slot) => {
            const player = room.players.get(slot);
            return {
                slot,
                name: player?.name ?? null,
                connected: Boolean(player?.connected),
            };
        });
    }

    getRoomSettings(room) {
        return {
            gameMode: room.gameMode,
            ballSpeed: room.ballSpeed,
        };
    }

    removePlayer(ws) {
        const room = this.findRoomBySocket(ws);
        if (!room) {
            return null;
        }

        const slot = this.getPlayerSlot(room, ws);
        if (slot === null) {
            return room;
        }

        const player = room.players.get(slot);
        if (player) {
            player.connected = false;
            player.ws = null;
        }

        if (room.players.size === 0 || [...room.players.values()].every((p) => !p.connected)) {
            this.destroyRoom(room.id);
            return null;
        }

        this.broadcast(room, {
            type: "roomUpdate",
            roomId: room.id,
            players: this.getPlayersList(room),
            status: room.status,
            settings: this.getRoomSettings(room),
            message: player?.name + " отключился",
        });

        return room;
    }

    destroyRoom(roomId) {
        const room = this.getRoom(roomId);
        if (!room) {
            return;
        }

        if (room.interval) {
            clearInterval(room.interval);
        }
        if (room.countdown) {
            clearTimeout(room.countdown);
        }

        this.rooms.delete(room.id);
    }

    broadcast(room, payload, exceptWs = null) {
        const message = JSON.stringify(payload);
        for (const player of room.players.values()) {
            if (player.ws && player.ws !== exceptWs && player.ws.readyState === 1) {
                player.ws.send(message);
            }
        }
    }

    sendToAll(room, payload) {
        const message = JSON.stringify(payload);
        for (const player of room.players.values()) {
            if (player.ws && player.ws.readyState === 1) {
                player.ws.send(message);
            }
        }
    }

    send(ws, payload) {
        if (ws.readyState === 1) {
            ws.send(JSON.stringify(payload));
        }
    }

    requiredPlayers(room) {
        return room.gameMode === "solo" ? 1 : 2;
    }

    maybeStartCountdown(room) {
        const connected = [...room.players.values()].filter((player) => player.connected);
        if (room.status !== "waiting" || connected.length < this.requiredPlayers(room)) {
            return;
        }

        if (room.gameMode === "solo") {
            this.startGame(room);
            return;
        }

        room.status = "countdown";
        let seconds = 3;

        this.broadcast(room, {
            type: "countdown",
            roomId: room.id,
            seconds,
        });

        const tickCountdown = () => {
            seconds -= 1;
            if (seconds > 0) {
                this.broadcast(room, {
                    type: "countdown",
                    roomId: room.id,
                    seconds,
                });
                room.countdown = setTimeout(tickCountdown, 1000);
                return;
            }

            this.startGame(room);
        };

        room.countdown = setTimeout(tickCountdown, 1000);
    }

    updateSettings(room, ballSpeed) {
        if (room.status !== "waiting") {
            return false;
        }

        room.ballSpeed = normalizeBallSpeedKey(ballSpeed);
        this.broadcast(room, {
            type: "roomUpdate",
            roomId: room.id,
            players: this.getPlayersList(room),
            status: room.status,
            settings: this.getRoomSettings(room),
            message: "Скорость мяча: " + room.ballSpeed,
        });
        return true;
    }

    startSolo(ws, playerName, ballSpeed) {
        this.removePlayer(ws);

        const room = this.createRoom(playerName, "solo", ballSpeed);
        this.addPlayer(room, ws, playerName, 0);
        this.startGame(room);

        if (!room.gameState) {
            return null;
        }

        const payload = {
            type: "soloStarted",
            slot: 0,
            settings: this.getRoomSettings(room),
            state: serializeState(room.gameState, this.getPlayersList(room)),
        };

        this.send(ws, payload);
        return room;
    }

    startGame(room) {
        if (room.countdown) {
            clearTimeout(room.countdown);
            room.countdown = null;
        }

        room.gameState = createGameState({
            mode: room.gameMode,
            ballSpeed: room.ballSpeed,
        });
        room.status = "playing";
        room.inputs = [
            { move: 0, launchBall: false },
            { move: 0, launchBall: false },
        ];

        if (room.interval) {
            clearInterval(room.interval);
        }

        room.interval = setInterval(() => {
            this.gameTick(room);
        }, TICK_MS);

        this.broadcastGameState(room);
    }

    setInput(room, slot, input) {
        room.inputs[slot] = {
            move: input.move ?? 0,
            launchBall: Boolean(input.launchBall),
        };
    }

    gameTick(room) {
        if (!room.gameState || room.status !== "playing") {
            return;
        }

        const slots = room.gameMode === "solo" ? [0] : [0, 1];
        for (const slot of slots) {
            applyInput(room.gameState, slot, room.inputs[slot]);
            room.inputs[slot].launchBall = false;
        }

        if (room.gameState.status === "levelup") {
            this.broadcastGameState(room);
            return;
        }

        const previousStatus = room.gameState.status;
        tickGame(room.gameState);

        if (room.gameState.status === "gameover" && previousStatus !== "gameover") {
            room.status = "gameover";
            if (room.interval) {
                clearInterval(room.interval);
                room.interval = null;
            }
        }

        this.broadcastGameState(room);
    }

    broadcastGameState(room) {
        if (!room.gameState) {
            return;
        }

        this.sendToAll(room, {
            type: "gameState",
            roomId: room.id,
            state: serializeState(room.gameState, this.getPlayersList(room)),
        });
    }

    surrender(room, slot) {
        if (!room.gameState || room.status !== "playing") {
            return false;
        }

        applySurrender(room.gameState, slot);
        room.status = "gameover";

        if (room.interval) {
            clearInterval(room.interval);
            room.interval = null;
        }

        const state = serializeState(room.gameState, this.getPlayersList(room));
        this.sendToAll(room, {
            type: "matchEnded",
            reason: "surrender",
            surrenderedBy: slot,
            state,
        });
        return true;
    }
}
