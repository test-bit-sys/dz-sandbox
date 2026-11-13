<?php

declare(strict_types=1);

namespace App\Services;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use RuntimeException;

class YalidineDeliveryService
{
    private Client $http;

    public function __construct(?Client $client = null)
    {
        $baseUrl = (string) config('dz_sandbox.yalidine.base_url', 'http://127.0.0.1:4003/v1');
        $apiId = (string) config('dz_sandbox.yalidine.api_id', 'test_api_id');
        $apiToken = (string) config('dz_sandbox.yalidine.api_token', 'test_api_token');

        $this->http = $client ?? new Client([
            'base_uri' => rtrim($baseUrl, '/') . '/',
            'timeout' => (float) config('dz_sandbox.yalidine.timeout', 10.0),
            'headers' => [
                'X-API-ID' => $apiId,
                'X-API-TOKEN' => $apiToken,
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
            ],
        ]);
    }

    /**
     * Get available Wilayas.
     *
     * @return array<int, array{id: int, name: string, is_deliverable: bool}>
     */
    public function getWilayas(): array
    {
        try {
            $response = $this->http->get('wilayas');
            $data = (array) json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
            return $data['data'] ?? [];
        } catch (GuzzleException $e) {
            throw new RuntimeException('Failed to fetch Yalidine wilayas: ' . $e->getMessage(), 0, $e);
        }
    }

    /**
     * Create parcel(s) for delivery.
     *
     * @param array<int, array{
     *   order_id: string,
     *   firstname: string,
     *   familyname: string,
     *   contact_phone: string,
     *   address: string,
     *   to_wilaya_name: string,
     *   to_commune_name: string,
     *   product_list: string,
     *   price: int|float,
     *   freeshipping: bool,
     *   is_stopdesk: bool,
     *   has_exchange: bool
     * }> $parcels
     * @return array<string, mixed>
     */
    public function createParcels(array $parcels): array
    {
        try {
            $response = $this->http->post('parcels', [
                'json' => $parcels,
            ]);

            return (array) json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        } catch (GuzzleException $e) {
            throw new RuntimeException('Failed to create Yalidine parcel: ' . $e->getMessage(), 0, $e);
        }
    }

    /**
     * Track a parcel by tracking ID.
     *
     * @param string $trackingId e.g. yal-trk-12345
     * @return array<string, mixed>
     */
    public function trackParcel(string $trackingId): array
    {
        try {
            $response = $this->http->get("histories?tracking={$trackingId}");
            return (array) json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        } catch (GuzzleException $e) {
            throw new RuntimeException("Failed to track parcel {$trackingId}: " . $e->getMessage(), 0, $e);
        }
    }
}
