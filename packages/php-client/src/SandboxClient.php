<?php

declare(strict_types=1);

namespace DzSandbox;

use RuntimeException;
use TimeoutException;

/**
 * Minimal zero-dependency PHP client for dz-sandbox Control API.
 * Supports PHP 7.4+, 8.0, 8.1, 8.2, 8.3+.
 */
class SandboxClient
{
    private string $controlUrl;
    private ?string $token;

    public function __construct(?string $controlUrl = null, ?string $token = null)
    {
        $defaultPort = getenv('DZ_CONTROL_PORT') ?: '4000';
        $rawUrl = $controlUrl ?: getenv('DZ_CONTROL_URL') ?: "http://127.0.0.1:{$defaultPort}";
        $this->controlUrl = rtrim($rawUrl, '/');
        $this->token = $token ?: getenv('DZ_CONTROL_TOKEN') ?: null;
    }

    /**
     * Send an HTTP request to the Control API.
     *
     * @param string $method GET, POST, PUT, DELETE
     * @param string $path
     * @param array<string, mixed>|null $body
     * @return array<string, mixed>
     */
    private function request(string $method, string $path, ?array $body = null): array
    {
        $url = $this->controlUrl . $path;
        $headers = [
            'Accept: application/json',
        ];

        if ($this->token !== null && $this->token !== '') {
            $headers[] = 'Authorization: Bearer ' . $this->token;
        }

        $content = null;
        if ($body !== null) {
            $content = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            $headers[] = 'Content-Type: application/json';
            $headers[] = 'Content-Length: ' . strlen((string)$content);
        }

        $options = [
            'http' => [
                'method' => $method,
                'header' => implode("\r\n", $headers),
                'content' => $content,
                'ignore_errors' => true,
                'timeout' => 10,
            ],
        ];

        $context = stream_context_create($options);
        $result = @file_get_contents($url, false, $context);

        if ($result === false) {
            $error = error_get_last();
            throw new RuntimeException("dz-sandbox request failed ($method $url): " . ($error['message'] ?? 'Unknown error'));
        }

        $decoded = json_decode($result, true);
        if (!is_array($decoded)) {
            throw new RuntimeException("Invalid JSON response from dz-sandbox ($method $url): " . substr($result, 0, 200));
        }

        return $decoded;
    }

    /**
     * Reset all sandbox state, stores, and custom scenarios.
     */
    public function reset(): array
    {
        return $this->request('POST', '/__control/reset', []);
    }

    /**
     * Set active scenario for a provider (e.g. chargily, satim, yalidine, baridimob).
     */
    public function scenario(string $provider, string $name): array
    {
        $encoded = rawurlencode($provider);
        return $this->request('PUT', "/__control/scenario/{$encoded}", ['scenario' => $name]);
    }

    /**
     * Set scenario for a specific resource ID.
     */
    public function resourceScenario(string $provider, string $resourceId, string $name): array
    {
        $encProv = rawurlencode($provider);
        $encRes = rawurlencode($resourceId);
        return $this->request('PUT', "/__control/scenario/{$encProv}/{$encRes}", ['scenario' => $name]);
    }

    /**
     * Set sequence of scenarios for a provider.
     *
     * @param string[] $sequence
     */
    public function sequenceScenario(string $provider, array $sequence, bool $loop = false): array
    {
        $encProv = rawurlencode($provider);
        return $this->request('PUT', "/__control/scenario/{$encProv}", [
            'sequence' => $sequence,
            'loop' => $loop,
        ]);
    }

    /**
     * Poll until the expected number of webhooks arrive or timeout occurs.
     *
     * @return array<int, array<string, mixed>>
     */
    public function waitForWebhook(
        ?string $provider = null,
        ?string $eventType = null,
        int $count = 1,
        int $timeoutMs = 5000,
        int $pollIntervalMs = 50
    ): array {
        $deadline = microtime(true) + ($timeoutMs / 1000.0);
        $query = $provider !== null ? '?provider=' . rawurlencode($provider) : '';

        while (true) {
            $data = $this->request('GET', "/__control/webhooks{$query}");
            $hooks = $data['webhooks'] ?? [];

            if ($eventType !== null) {
                $hooks = array_values(array_filter($hooks, fn($h) => ($h['eventType'] ?? null) === $eventType));
            }

            if (count($hooks) >= $count) {
                return $hooks;
            }

            if (microtime(true) >= $deadline) {
                throw new RuntimeException(
                    "Timed out waiting for {$count} webhook(s) after {$timeoutMs}ms (found " . count($hooks) . ')'
                );
            }

            usleep($pollIntervalMs * 1000);
        }
    }

    /**
     * Advance virtual clock by duration (e.g. "5m", "1h", "24h" or milliseconds).
     */
    public function clockAdvance($duration): array
    {
        return $this->request('POST', '/__control/clock/advance', ['duration' => $duration]);
    }

    /**
     * Reset virtual clock back to real system time.
     */
    public function clockReset(): array
    {
        return $this->request('POST', '/__control/clock/reset', []);
    }

    /**
     * Get current sandbox state and counts.
     */
    public function state(): array
    {
        return $this->request('GET', '/__control/state');
    }

    /**
     * List all available scenarios.
     */
    public function scenarios(): array
    {
        return $this->request('GET', '/__control/scenarios');
    }

    /**
     * Get recorded HTTP requests received by mock servers.
     */
    public function requests(?string $provider = null, int $limit = 50): array
    {
        $params = ['limit' => $limit];
        if ($provider !== null) {
            $params['provider'] = $provider;
        }
        return $this->request('GET', '/__control/requests?' . http_build_query($params));
    }
}
