export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 640 }}>
      <h1>Next.js COD Store Example (Yalidine + dz-sandbox)</h1>
      <p>
        Send a <code>POST</code> request to <code>/api/orders/cod</code> to create a simulated
        Yalidine COD parcel against <code>YALIDINE_BASE_URL</code>.
      </p>
    </main>
  );
}
