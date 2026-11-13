<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\ChargilyPayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Log;

class ChargilyWebhookController extends Controller
{
    public function __construct(private ChargilyPayService $chargily)
    {
    }

    /**
     * Handle incoming Chargily Pay v2 webhook.
     */
    public function handle(Request $request): JsonResponse
    {
        $signature = (string) $request->header('signature', '');
        $rawPayload = (string) $request->getContent();

        // 1. Verify HMAC-SHA256 signature
        if (!$this->chargily->verifyWebhookSignature($rawPayload, $signature)) {
            Log::warning('[Chargily Webhook] Invalid signature rejected.');
            return response()->json(['error' => 'Invalid signature'], 403);
        }

        $event = $request->json()->all();
        $eventType = $event['type'] ?? 'unknown';
        $data = $event['data'] ?? [];

        Log::info("[Chargily Webhook] Event received: {$eventType}", ['id' => $event['id'] ?? null]);

        // 2. Process event types idempotently
        switch ($eventType) {
            case 'checkout.paid':
                $checkoutId = $data['id'] ?? null;
                $amount = $data['amount'] ?? 0;
                // Update your order state to 'PAID' in database:
                // Order::where('checkout_id', $checkoutId)->update(['status' => 'paid']);
                Log::info("[Order Paid] Checkout {$checkoutId} settled for {$amount} DZD");
                break;

            case 'checkout.failed':
                $checkoutId = $data['id'] ?? null;
                // Order::where('checkout_id', $checkoutId)->update(['status' => 'payment_failed']);
                Log::notice("[Order Failed] Checkout {$checkoutId} payment failed");
                break;

            case 'checkout.canceled':
                $checkoutId = $data['id'] ?? null;
                // Order::where('checkout_id', $checkoutId)->update(['status' => 'canceled']);
                Log::info("[Order Canceled] Checkout {$checkoutId} was canceled by customer");
                break;

            default:
                Log::info("[Chargily Webhook] Unhandled event type: {$eventType}");
                break;
        }

        return response()->json(['received' => true, 'event' => $eventType]);
    }
}
