<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$dataFile = __DIR__ . '/../data/scores.json';
$maxScores = 10;

function readScores(string $file): array
{
    if (!is_file($file)) {
        return [];
    }

    $content = file_get_contents($file);
    if ($content === false) {
        return [];
    }

    $data = json_decode($content, true);
    return is_array($data) ? $data : [];
}

function writeScores(string $file, array $scores): bool
{
    $dir = dirname($file);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        return false;
    }

    $json = json_encode(array_values($scores), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        return false;
    }

    return file_put_contents($file, $json, LOCK_EX) !== false;
}

function sortScores(array $scores): array
{
    usort($scores, static function (array $a, array $b): int {
        return ($b['score'] ?? 0) <=> ($a['score'] ?? 0);
    });

    return $scores;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $scores = sortScores(readScores($dataFile));
    echo json_encode(array_slice($scores, 0, $maxScores), JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $playerName = trim((string)($input['playerName'] ?? 'Player'));
    if ($playerName === '') {
        $playerName = 'Player';
    }

    $score = max(0, (int)($input['score'] ?? 0));
    $entry = [
        'playerName' => mb_substr($playerName, 0, 32),
        'score' => $score,
    ];

    $scores = readScores($dataFile);
    $scores[] = $entry;
    $scores = sortScores($scores);

    if (count($scores) > 30) {
        $scores = array_slice($scores, 0, 30);
    }

    if (!writeScores($dataFile, $scores)) {
        http_response_code(500);
        echo json_encode(['error' => 'Unable to save score'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode($entry, JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
