export const WIDTH = 800;
export const HEIGHT = 600;

export const PADDLE_WIDTH = 110;
export const PADDLE_WIDTH_SOLO = 120;
export const PADDLE_HEIGHT = 16;
export const PADDLE_Y_BOTTOM = HEIGHT - 40;
export const PADDLE_Y_TOP = 24;
export const PADDLE_SPEED = 8;

export const BALL_RADIUS = 8;

export const BALL_COLORS = ["#7dd3fc", "#f472b6"];

/** Сколько ширин блока мяч проходит за 1 секунду */
export const SPEED_BLOCKS_PER_SECOND = {
    easy: 1,
    medium: 2,
    hard: 3,
};

export const BRICK_ROWS = 6;
export const BRICK_COLS = 10;
export const BRICK_PADDING = 8;
export const BRICK_OFFSET_TOP = 60;
export const BRICK_OFFSET_LEFT = 35;
export const BRICK_HEIGHT = 24;

export const BRICK_COLORS = [
    "#f87171",
    "#fb923c",
    "#facc15",
    "#4ade80",
    "#38bdf8",
    "#a78bfa",
];

export const TICK_MS = 50;

export const VERSUS_WALL_HEIGHT = 14;
export const VERSUS_PLAY_MARGIN = 24;

export const VERSUS_WALL_COLORS = {
    red: "#dc2626",
    blue: "#2563eb",
};

export function normalizeBallSpeedKey(ballSpeed) {
    const key = String(ballSpeed || "easy").toLowerCase();
    return Object.prototype.hasOwnProperty.call(SPEED_BLOCKS_PER_SECOND, key)
        ? key
        : "easy";
}

export function getBrickWidthFromState(state) {
    const brick = state.bricks.find((b) => b.alive) || state.bricks[0];
    return brick?.width ?? brickWidth();
}

/** Скорость мяча в пикселях за один игровой тик (50 ms) */
export function resolveBallSpeedValue(ballSpeed, brickWidthPx) {
    const key = normalizeBallSpeedKey(ballSpeed);
    const blocksPerSecond = SPEED_BLOCKS_PER_SECOND[key];
    const pixelsPerSecond = brickWidthPx * blocksPerSecond;
    return pixelsPerSecond * (TICK_MS / 1000);
}

export function refreshBallSpeed(state) {
    const brickWidthPx = getBrickWidthFromState(state);
    state.brickWidthPx = brickWidthPx;
    state.ballSpeedValue = resolveBallSpeedValue(state.ballSpeed, brickWidthPx);
}

function normalizeBallVelocity(ball, targetSpeed) {
    const magnitude = Math.hypot(ball.dx, ball.dy);
    if (magnitude < 0.001) {
        ball.dx = targetSpeed * 0.5;
        ball.dy = -targetSpeed;
        return;
    }
    const scale = targetSpeed / magnitude;
    ball.dx *= scale;
    ball.dy *= scale;
}

function setBallVelocity(ball, speedPerTick, slot) {
    const horizontal = (Math.random() > 0.5 ? 1 : -1) * 0.55;
    if (slot === 1) {
        ball.dy = speedPerTick;
        ball.dx = horizontal * speedPerTick;
    } else {
        ball.dy = -speedPerTick;
        ball.dx = horizontal * speedPerTick;
    }
    normalizeBallVelocity(ball, speedPerTick);
}

function brickWidth() {
    const totalPadding = BRICK_PADDING * (BRICK_COLS + 1);
    return (WIDTH - BRICK_OFFSET_LEFT * 2 - totalPadding) / BRICK_COLS;
}

export function createBricks() {
    const width = brickWidth();
    const bricks = [];

    for (let row = 0; row < BRICK_ROWS; row++) {
        for (let col = 0; col < BRICK_COLS; col++) {
            bricks.push({
                x: BRICK_OFFSET_LEFT + col * (width + BRICK_PADDING),
                y: BRICK_OFFSET_TOP + row * (BRICK_HEIGHT + BRICK_PADDING),
                width,
                height: BRICK_HEIGHT,
                alive: true,
                color: BRICK_COLORS[row % BRICK_COLORS.length],
                points: (BRICK_ROWS - row) * 10,
            });
        }
    }

    return bricks;
}

export function getVersusPlayBounds() {
    const top = PADDLE_Y_TOP + PADDLE_HEIGHT + VERSUS_PLAY_MARGIN;
    const bottom = PADDLE_Y_BOTTOM - VERSUS_PLAY_MARGIN;
    return { top, bottom };
}

export function createVersusBricks() {
    const width = brickWidth();
    const { top, bottom } = getVersusPlayBounds();
    const rowCount = BRICK_ROWS;
    const gridHeight = rowCount * BRICK_HEIGHT + (rowCount - 1) * BRICK_PADDING;
    const startY = top + (bottom - top - gridHeight) / 2;
    const bricks = [];

    for (let row = 0; row < rowCount; row++) {
        for (let col = 0; col < BRICK_COLS; col++) {
            bricks.push({
                x: BRICK_OFFSET_LEFT + col * (width + BRICK_PADDING),
                y: startY + row * (BRICK_HEIGHT + BRICK_PADDING),
                width,
                height: BRICK_HEIGHT,
                alive: true,
                color: BRICK_COLORS[row % BRICK_COLORS.length],
                points: (BRICK_ROWS - row) * 10,
            });
        }
    }

    return bricks;
}

export function getVersusWalls() {
    return {
        redWall: {
            y: HEIGHT - VERSUS_WALL_HEIGHT,
            height: VERSUS_WALL_HEIGHT,
            color: VERSUS_WALL_COLORS.red,
            owner: 1,
        },
        blueWall: {
            y: 0,
            height: VERSUS_WALL_HEIGHT,
            color: VERSUS_WALL_COLORS.blue,
            owner: 0,
        },
    };
}

export function getPaddleY(mode, slot) {
    if (mode === "versus") {
        return slot === 0 ? PADDLE_Y_BOTTOM : PADDLE_Y_TOP;
    }
    return PADDLE_Y_BOTTOM;
}

export function createInitialPaddles(mode) {
    if (mode === "solo") {
        const width = PADDLE_WIDTH_SOLO;
        return [{ x: WIDTH / 2 - width / 2, width }];
    }

    if (mode === "versus") {
        return [
            { x: WIDTH / 2 - PADDLE_WIDTH / 2, width: PADDLE_WIDTH },
            { x: WIDTH / 2 - PADDLE_WIDTH / 2, width: PADDLE_WIDTH },
        ];
    }

    return [
        { x: WIDTH * 0.25 - PADDLE_WIDTH / 2, width: PADDLE_WIDTH },
        { x: WIDTH * 0.75 - PADDLE_WIDTH / 2, width: PADDLE_WIDTH },
    ];
}

export function createBallForOwner(state, owner) {
    const paddle = state.paddles[owner];
    const speed = state.ballSpeedValue;
    const paddleY = getPaddleY(state.mode, owner);
    const attachedOnTop = state.mode === "versus" && owner === 1;

    const ball = {
        owner,
        color: BALL_COLORS[owner],
        x: paddle.x + paddle.width / 2,
        y: attachedOnTop
            ? paddleY + PADDLE_HEIGHT + BALL_RADIUS + 2
            : paddleY - BALL_RADIUS - 2,
        dx: 0,
        dy: 0,
        radius: BALL_RADIUS,
        attached: true,
        attachedTo: owner,
    };

    setBallVelocity(ball, speed, owner);
    return ball;
}

export function createInitialBall(state, attachedTo = 0) {
    return createBallForOwner(state, attachedTo);
}

export function createGameState(options = {}) {
    const mode = options.mode === "solo" || options.mode === "versus" ? options.mode : "coop";
    const ballSpeed = normalizeBallSpeedKey(options.ballSpeed);
    const bricks = mode === "versus" ? createVersusBricks() : createBricks();
    const brickWidthPx = bricks[0].width;
    const ballSpeedValue = resolveBallSpeedValue(ballSpeed, brickWidthPx);
    const paddles = createInitialPaddles(mode);

    const state = {
        mode,
        ballSpeed,
        brickWidthPx,
        ballSpeedValue,
        score: 0,
        lives: 3,
        scores: [0, 0],
        livesPerPlayer: [3, 3],
        level: 1,
        winner: null,
        surrenderedBy: null,
        paddles,
        ball: null,
        balls: null,
        bricks,
        status: "playing",
        message: "",
    };

    if (mode === "versus") {
        state.balls = [createBallForOwner(state, 0), createBallForOwner(state, 1)];
    } else {
        state.ball = createInitialBall(state, 0);
    }

    return state;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function activeSlots(state) {
    if (state.mode === "solo") {
        return [0];
    }
    return [0, 1];
}

function attachBallToPaddle(state, slot) {
    if (state.mode === "versus") {
        state.balls[slot] = createBallForOwner(state, slot);
        return;
    }
    state.ball = createInitialBall(state, slot);
}

function syncAttachedBall(state, slot) {
    if (state.mode === "versus") {
        const ball = state.balls[slot];
        if (!ball?.attached || ball.owner !== slot) {
            return;
        }
        const paddle = state.paddles[slot];
        const paddleY = getPaddleY(state.mode, slot);
        ball.x = paddle.x + paddle.width / 2;
        ball.y =
            slot === 1
                ? paddleY + PADDLE_HEIGHT + ball.radius + 2
                : paddleY - ball.radius - 2;
        return;
    }

    const ball = state.ball;
    if (!ball?.attached || ball.attachedTo !== slot) {
        return;
    }
    const paddle = state.paddles[slot];
    const paddleY = getPaddleY(state.mode, slot);
    ball.x = paddle.x + paddle.width / 2;
    ball.y = paddleY - ball.radius - 2;
}

function launchBall(ball, slot, state) {
    ball.attached = false;
    setBallVelocity(ball, state.ballSpeedValue, slot);
}

function paddleHitFactor(slot, paddle, ball, speed) {
    const hitPos = (ball.x - paddle.x) / paddle.width - 0.5;
    const direction = slot === 1 ? -1 : 1;
    return hitPos * speed * 1.2 * direction;
}

function handlePaddleCollision(state, ball, slot, paddle, paddleY) {
    const onTop = slot === 1;
    const speed = state.ballSpeedValue;

    if (onTop) {
        if (
            ball.dy >= 0 ||
            ball.y - ball.radius > paddleY + PADDLE_HEIGHT ||
            ball.y + ball.radius < paddleY ||
            ball.x < paddle.x ||
            ball.x > paddle.x + paddle.width
        ) {
            return false;
        }

        ball.dy = speed;
        ball.dx = paddleHitFactor(slot, paddle, ball, speed);
        ball.y = paddleY + PADDLE_HEIGHT + ball.radius + 1;
        normalizeBallVelocity(ball, speed);
    } else {
        if (
            ball.dy <= 0 ||
            ball.y + ball.radius < paddleY ||
            ball.y - ball.radius > paddleY + PADDLE_HEIGHT ||
            ball.x < paddle.x ||
            ball.x > paddle.x + paddle.width
        ) {
            return false;
        }

        ball.dy = -speed;
        ball.dx = paddleHitFactor(slot, paddle, ball, speed);
        ball.y = paddleY - ball.radius - 1;
        normalizeBallVelocity(ball, speed);
    }

    ball.attachedTo = slot;
    return true;
}

function loseLifeCoop(state) {
    state.lives -= 1;
    if (state.lives <= 0) {
        state.status = "gameover";
        state.message = "Игра окончена";
        return;
    }
    attachBallToPaddle(state, 0);
}

function loseLifeVersus(state, slot) {
    state.livesPerPlayer[slot] -= 1;
    if (state.livesPerPlayer[slot] <= 0) {
        state.winner = slot === 0 ? 1 : 0;
        state.status = "gameover";
        state.message = "Победил игрок " + (state.winner + 1);
        return;
    }
    attachBallToPaddle(state, slot);
}

function resolveVersusWinner(state) {
    state.status = "gameover";
    state.winner =
        state.scores[0] === state.scores[1]
            ? null
            : state.scores[0] > state.scores[1]
              ? 0
              : 1;
    state.message =
        state.winner === null
            ? "Ничья"
            : "Победил игрок " + (state.winner + 1);
}

export function applyInput(state, slot, input) {
    const paddle = state.paddles[slot];
    if (!paddle) {
        return;
    }

    const move = input.move ?? 0;
    if (move !== 0) {
        paddle.x = clamp(paddle.x + move * PADDLE_SPEED, 0, WIDTH - paddle.width);
    }

    if (state.mode === "versus") {
        const ball = state.balls[slot];
        if (input.launchBall && ball?.attached && ball.owner === slot) {
            launchBall(ball, slot, state);
        }
        syncAttachedBall(state, slot);
        return;
    }

    if (
        input.launchBall &&
        state.ball.attached &&
        state.ball.attachedTo === slot
    ) {
        launchBall(state.ball, slot, state);
    }

    syncAttachedBall(state, slot);
}

function updateSharedBall(state) {
    const ball = state.ball;
    if (ball.attached) {
        syncAttachedBall(state, ball.attachedTo);
        return;
    }

    ball.x += ball.dx;
    ball.y += ball.dy;

    if (ball.x - ball.radius <= 0) {
        ball.x = ball.radius;
        ball.dx *= -1;
    } else if (ball.x + ball.radius >= WIDTH) {
        ball.x = WIDTH - ball.radius;
        ball.dx *= -1;
    }

    if (ball.y - ball.radius <= 0) {
        ball.y = ball.radius;
        ball.dy *= -1;
    }

    for (const slot of activeSlots(state)) {
        const paddle = state.paddles[slot];
        if (!paddle) {
            continue;
        }
        handlePaddleCollision(state, ball, slot, paddle, getPaddleY(state.mode, slot));
    }

    if (ball.y - ball.radius > HEIGHT) {
        loseLifeCoop(state);
    }
}

function handleVersusBoundaryWalls(state, ball) {
    const slot = ball.owner;
    const speed = state.ballSpeedValue;
    const redWallY = HEIGHT - VERSUS_WALL_HEIGHT;
    const blueWallBottom = VERSUS_WALL_HEIGHT;

    if (slot === 1) {
        if (ball.y + ball.radius >= redWallY) {
            ball.y = redWallY - ball.radius - 1;
            ball.dy = -Math.abs(ball.dy);
            normalizeBallVelocity(ball, speed);
            return;
        }
        if (ball.y - ball.radius <= blueWallBottom) {
            loseLifeVersus(state, 1);
        }
        return;
    }

    if (ball.y - ball.radius <= blueWallBottom) {
        ball.y = blueWallBottom + ball.radius + 1;
        ball.dy = Math.abs(ball.dy);
        normalizeBallVelocity(ball, speed);
        return;
    }
    if (ball.y + ball.radius >= redWallY) {
        loseLifeVersus(state, 0);
    }
}

function updateVersusBall(state, ball) {
    const slot = ball.owner;
    if (ball.attached) {
        syncAttachedBall(state, slot);
        return;
    }

    if (state.status === "gameover") {
        return;
    }

    ball.x += ball.dx;
    ball.y += ball.dy;

    if (ball.x - ball.radius <= 0) {
        ball.x = ball.radius;
        ball.dx *= -1;
    } else if (ball.x + ball.radius >= WIDTH) {
        ball.x = WIDTH - ball.radius;
        ball.dx *= -1;
    }

    const paddle = state.paddles[slot];
    if (paddle) {
        handlePaddleCollision(state, ball, slot, paddle, getPaddleY(state.mode, slot));
    }

    if (ball.attached) {
        return;
    }

    handleVersusBoundaryWalls(state, ball);
}

function updateBalls(state) {
    if (state.mode === "versus") {
        for (const ball of state.balls) {
            if (state.status === "gameover") {
                return;
            }
            updateVersusBall(state, ball);
        }
        return;
    }

    updateSharedBall(state);
}

function handleBrickCollision(state, ball, brick) {
    brick.alive = false;
    const points = brick.points;

    if (state.mode === "versus") {
        state.scores[ball.owner] += points;
    } else {
        state.score += points;
    }

    const overlapLeft = ball.x + ball.radius - brick.x;
    const overlapRight = brick.x + brick.width - (ball.x - ball.radius);
    const overlapTop = ball.y + ball.radius - brick.y;
    const overlapBottom = brick.y + brick.height - (ball.y - ball.radius);
    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

    if (minOverlap === overlapLeft || minOverlap === overlapRight) {
        ball.dx *= -1;
    } else {
        ball.dy *= -1;
    }
}

function updateBricks(state) {
    if (state.status === "gameover") {
        return;
    }

    const balls =
        state.mode === "versus"
            ? state.balls.filter((ball) => !ball.attached)
            : state.ball.attached
              ? []
              : [state.ball];

    for (const ball of balls) {
        for (const brick of state.bricks) {
            if (!brick.alive) {
                continue;
            }

            if (
                ball.x + ball.radius >= brick.x &&
                ball.x - ball.radius <= brick.x + brick.width &&
                ball.y + ball.radius >= brick.y &&
                ball.y - ball.radius <= brick.y + brick.height
            ) {
                handleBrickCollision(state, ball, brick);
                break;
            }
        }
    }

    if (state.bricks.every((brick) => !brick.alive)) {
        if (state.mode === "versus") {
            resolveVersusWinner(state);
            return;
        }

        state.level += 1;
        state.paddles = state.paddles.map((paddle) => ({
            ...paddle,
            width: Math.max(70, paddle.width - 8),
        }));
        state.paddles.forEach((paddle) => {
            paddle.x = clamp(paddle.x, 0, WIDTH - paddle.width);
        });
        state.bricks =
            state.mode === "versus" ? createVersusBricks() : createBricks();
        refreshBallSpeed(state);
        state.ballSpeedValue *= 1.08;

        if (state.mode === "versus") {
            state.balls.forEach((ball) => {
                if (!ball.attached) {
                    normalizeBallVelocity(ball, state.ballSpeedValue);
                }
            });
        } else if (!state.ball.attached) {
            normalizeBallVelocity(state.ball, state.ballSpeedValue);
        }
        state.status = "levelup";
        state.message = "Уровень " + state.level;
        attachBallToPaddle(state, 0);
    }
}

export function tickGame(state) {
    if (state.status === "gameover" || state.status === "levelup") {
        return state;
    }

    updateBalls(state);
    if (state.status !== "gameover") {
        updateBricks(state);
    }

    return state;
}

export function applySurrender(state, slot) {
    if (state.status === "gameover") {
        return state;
    }

    state.surrenderedBy = slot;

    if (state.mode === "versus" || state.mode === "coop") {
        state.winner = slot === 0 ? 1 : 0;
        state.message =
            "Игрок " +
            (slot + 1) +
            " сдался. " +
            (state.mode === "versus"
                ? "Победил игрок " + (state.winner + 1)
                : "Игра остановлена");
    } else {
        state.message = "Игра завершена";
    }

    state.status = "gameover";
    return state;
}

export function serializeState(state, players) {
    return {
        mode: state.mode,
        ballSpeed: state.ballSpeed,
        brickWidthPx: state.brickWidthPx,
        ballSpeedValue: state.ballSpeedValue,
        score: state.score,
        lives: state.lives,
        scores: state.scores,
        livesPerPlayer: state.livesPerPlayer,
        winner: state.winner,
        surrenderedBy: state.surrenderedBy,
        level: state.level,
        paddles: state.paddles,
        ball: state.ball,
        balls: state.balls,
        bricks: state.bricks,
        walls: state.mode === "versus" ? getVersusWalls() : null,
        status: state.status,
        message: state.message,
        players,
    };
}
