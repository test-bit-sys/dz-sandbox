<?php

declare(strict_types=1);

namespace App\Services;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use RuntimeException;

class SatimPaymentService
{
    private Client $http;
    private string $username;
    private string $password;
    private string $currencyCode;

    public function __construct(?Client $client = null)
    {
        $baseUrl = (string) config('dz_sandbox.satim.base_url', 'http://127.0.0.1:4002/payment/rest');
        $this->username = (string) config('dz_sandbox.satim.username', 'test_merchant');
        $this->password = (string) config('dz_sandbox.satim.password', 'test_password');
        $this->currencyCode = (string) config('dz_sandbox.satim.currency_code', '012');

        $this->http = $client ?? new Client([
            'base_uri' => rtrim($baseUrl, '/') . '/',
            'timeout' => (float) config('dz_sandbox.satim.timeout', 10.0),
        ]);
    }

    /**
     * Register a payment order with SATIM (register.do).
     *
     * @param string $orderNumber Unique merchant order reference
     * @param int $amountInCentimes Amount in DZD centimes (e.g. 500000 for 5000 DZD)
     * @param string $returnUrl URL where user returns after CIB/Edahabia payment
     * @return array{orderId: string, formUrl: string, errorCode?: string, errorMessage?: string}
     */
    public function registerOrder(string $orderNumber, int $amountInCentimes, string $returnUrl): array
    {
        try {
            $response = $this->http->post('register.do', [
                'form_params' => [
                    'userName' => $this->username,
                    'password' => $this->password,
                    'orderNumber' => $orderNumber,
                    'amount' => (string) $amountInCentimes,
                    'currency' => $this->currencyCode,
                    'returnUrl' => $returnUrl,
                ],
            ]);

            return (array) json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        } catch (GuzzleException $e) {
            throw new RuntimeException('Failed to register SATIM order: ' . $e->getMessage(), 0, $e);
        }
    }

    /**
     * Confirm / verify an order status with SATIM (confirmOrder.do).
     *
     * @param string $orderId SATIM order identifier returned from register.do
     * @return array{orderStatus: int, actionCode: int, errorMessage?: string}
     */
    public function confirmOrder(string $orderId): array
    {
        try {
            $response = $this->http->post('confirmOrder.do', [
                'form_params' => [
                    'userName' => $this->username,
                    'password' => $this->password,
                    'orderId' => $orderId,
                ],
            ]);

            return (array) json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        } catch (GuzzleException $e) {
            throw new RuntimeException('Failed to confirm SATIM order: ' . $e->getMessage(), 0, $e);
        }
    }
}
