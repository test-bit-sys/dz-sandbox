# @dz-sandbox/php-client

Zero-dependency PHP client for controlling **dz-sandbox** during local testing, CI/CD pipelines, and Laravel/Symfony test suites.

## Features

- **Zero external dependencies**: Uses standard PHP stream contexts.
- **Full Control API coverage**: Scenarios, virtual clock, webhooks, and request assertions.
- **Compatible**: Works with PHP 7.4 through PHP 8.3+.
- **Perfect for Laravel / PHPUnit / Pest**: Run deterministic offline tests against Chargily Pay v2, SATIM, Yalidine, and BaridiMob.

## Installation

```bash
composer require --dev dz-sandbox/client
```

Or copy `src/SandboxClient.php` directly into your test helpers!

## Usage Example

```php
<?php

use DzSandbox\SandboxClient;

$sandbox = new SandboxClient(); // Default: http://127.0.0.1:4000

// 1. Reset state before test
$sandbox->reset();

// 2. Set provider scenario to simulate failure
$sandbox->scenario('chargily', 'expired');

// 3. Or simulate mobile banking OTP timeout
$sandbox->scenario('baridimob', 'otp_timeout');

// 4. Trigger payment from your app, then wait for webhook
$webhooks = $sandbox->waitForWebhook('chargily', 'checkout.expired', count: 1, timeoutMs: 3000);

// 5. Advance virtual clock by 2 hours
$sandbox->clockAdvance('2h');
```

## Laravel Pest / PHPUnit Example

```php
beforeEach(function () {
    $this->sandbox = new \DzSandbox\SandboxClient();
    $this->sandbox->reset();
});

it('handles card payment rejection gracefully', function () {
    $this->sandbox->scenario('satim', 'declined');

    $response = $this->postJson('/api/checkout', [
        'amount' => 5000,
    ]);

    $response->assertStatus(400);
});
```
