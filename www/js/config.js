/** Полный URL WebSocket (переопределение, например для локальной разработки без Apache). */
window.ARKANOID_WS_URL = window.ARKANOID_WS_URL || null;

/** Путь на том же хосте/порте, что и сайт (80 или 443). По умолчанию /ws. */
window.ARKANOID_WS_PATH = window.ARKANOID_WS_PATH || "/ws";

function getWebSocketUrl() {
    if (window.ARKANOID_WS_URL) {
        return window.ARKANOID_WS_URL;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const path = window.ARKANOID_WS_PATH.startsWith("/")
        ? window.ARKANOID_WS_PATH
        : "/" + window.ARKANOID_WS_PATH;

    return protocol + "//" + window.location.host + path;
}
