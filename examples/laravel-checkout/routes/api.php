<?php

use App\Http\Controllers\ChargilyWebhookController;
use App\Http\Controllers\CheckoutController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Algerian E-Commerce & Webhook Routes
|--------------------------------------------------------------------------
*/

Route::prefix('checkout')->group(function () {
    Route::post('/chargily', [CheckoutController::class, 'payWithChargily']);
    Route::post('/satim', [CheckoutController::class, 'payWithSatim']);
    Route::get('/satim-callback', [CheckoutController::class, 'handleSatimReturn']);
});

// Webhook endpoint (excluded from CSRF in bootstrap/app.php or VerifyCsrfToken middleware)
Route::post('/webhooks/chargily', [ChargilyWebhookController::class, 'handle']);
