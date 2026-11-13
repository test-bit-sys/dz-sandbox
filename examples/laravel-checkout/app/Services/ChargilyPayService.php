<?php

declare(strict_types=1);

namespace App\Services;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use RuntimeException;

class ChargilyPayService
{
    private Client $http;
    private string $secretKey;

    public function __construct(?Client $client = null)
    {
        $baseUrl = (string) config('dz_sandbox.chargily.base_url', 'http://127.0.0.1:4001/api/v2');
        $this->secretKey = (string) config('dz_sandbox.chargily.secret_key', 'test_sk_dz_sandbox_chargily_secret');

        $this->http = $client ?? new Client([
            'base_uri' => rtrim($baseUrl, '/') . '/',
            'timeout' => (float) config('dz_sandbox.chargily.timeout', 10.0),
            'headers' => [
                'Authorization' => 'Bearer ' . $this->secretKey,
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
            ],
        ]);
    }

    /**
     * Create a new checkout session.
     *
     * @param array{amount: float|int, currency?: string, success_url: string, failure_url?: string, metadata?: array<string, mixed>} $params
     * @return array<string, mixed>
     */
    public function createCheckout(array $params): array
    {
        try {
            $response = $this->http->post('checkouts', [
                'json' => [
                    'amount' => $params['amount'],
                    'currency' => $params['currency'] ?? 'dzd',
                    'success_url' => $params['success_url'],
                    'failure_url' => $params['failure_url'] ?? null,
                    'metadata' => $params['metadata'] ?? [],
                ],
            ]);

            return (array) json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        } catch (GuzzleException $e) {
            throw new RuntimeException('Failed to create Chargily checkout: ' . $e->getMessage(), 0, $e);
        }
    }

    /**
     * Verify the HMAC-SHA256 signature from the 'signature' header.
     *
     * @param string $rawBody The raw HTTP request payload
     * @param string $headerSignature The signature header sent by Chargily
     * @return bool
     */
    public function verifyWebhookSignature(string $rawBody, string $headerSignature): bool
    {
        if (empty($headerSignature) || empty($this->secretKey)) {
            return false;
        }

        $computedSignature = hash_hmac('sha256', $rawBody, $this->secretKey);
        return hash_equals($computedSignature, $headerSignature);
    }
}
