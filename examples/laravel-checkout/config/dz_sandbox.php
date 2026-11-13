<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Algerian Providers Configuration (dz-sandbox compatible)
    |--------------------------------------------------------------------------
    */

    'chargily' => [
        'base_url' => env('CHARGILY_BASE_URL', 'http://127.0.0.1:4001/api/v2'),
        'public_key' => env('CHARGILY_PUBLIC_KEY', 'test_pk_dz_sandbox'),
        'secret_key' => env('CHARGILY_SECRET_KEY', 'test_sk_dz_sandbox_chargily_secret'),
        'timeout' => 10.0,
    ],

    'satim' => [
        'base_url' => env('SATIM_BASE_URL', 'http://127.0.0.1:4002/payment/rest'),
        'username' => env('SATIM_USERNAME', 'test_merchant'),
        'password' => env('SATIM_PASSWORD', 'test_password'),
        'terminal_id' => env('SATIM_TERMINAL_ID', 'E010901001'),
        'currency_code' => '012', // DZD ISO numeric code
        'timeout' => 10.0,
    ],

    'yalidine' => [
        'base_url' => env('YALIDINE_BASE_URL', 'http://127.0.0.1:4003/v1'),
        'api_id' => env('YALIDINE_API_ID', 'test_api_id'),
        'api_token' => env('YALIDINE_API_TOKEN', 'test_api_token'),
        'timeout' => 10.0,
    ],
];
