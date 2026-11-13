<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\ChargilyPayService;
use App\Services\SatimPaymentService;
use App\Services\YalidineDeliveryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class CheckoutController extends Controller
{
    public function __construct(
        private ChargilyPayService $chargily,
        private SatimPaymentService $satim,
        private YalidineDeliveryService $yalidine,
    ) {
    }

    /**
     * Initiate a Chargily Pay checkout session.
     */
    public function payWithChargily(Request $request): RedirectResponse
    {
        $amount = (float) $request->input('amount', 3500);

        $checkout = $this->chargily->createCheckout([
            'amount' => $amount,
            'currency' => 'dzd',
            'success_url' => url('/checkout/success'),
            'failure_url' => url('/checkout/failure'),
            'metadata' => [
                'order_id' => 'ORD-' . time(),
            ],
        ]);

        // Redirect to Chargily hosted payment page
        return redirect()->away($checkout['checkout_url']);
    }

    /**
     * Initiate a SATIM CIB / Edahabia checkout session.
     */
    public function payWithSatim(Request $request): RedirectResponse
    {
        $orderNumber = 'ORD-' . time();
        $amountInDzd = (float) $request->input('amount', 5000);
        $amountInCentimes = (int) round($amountInDzd * 100);

        $registration = $this->satim->registerOrder(
            $orderNumber,
            $amountInCentimes,
            url('/checkout/satim-return?orderNumber=' . $orderNumber)
        );

        if (!empty($registration['errorCode']) && $registration['errorCode'] !== '0') {
            return redirect()->to('/checkout/failure?error=' . urlencode($registration['errorMessage'] ?? 'SATIM error'));
        }

        // Store registration['orderId'] in session or database for confirmation check
        session(['satim_order_id' => $registration['orderId']]);

        // Redirect to SATIM hosted form
        return redirect()->away($registration['formUrl']);
    }

    /**
     * Handle return from SATIM hosted payment page.
     */
    public function handleSatimReturn(Request $request): JsonResponse
    {
        $orderId = (string) $request->input('orderId', session('satim_order_id', ''));
        if (empty($orderId)) {
            return response()->json(['error' => 'Missing SATIM orderId'], 400);
        }

        $confirmation = $this->satim->confirmOrder($orderId);
        $isPaid = ($confirmation['orderStatus'] ?? -1) === 2;

        return response()->json([
            'status' => $isPaid ? 'PAID' : 'FAILED',
            'satim_order_id' => $orderId,
            'details' => $confirmation,
        ]);
    }
}
