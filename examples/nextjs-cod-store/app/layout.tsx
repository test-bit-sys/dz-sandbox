import type { ReactNode } from 'react';

export const metadata = {
  title: 'dz-sandbox Next.js COD Store Example',
  description: 'Simulated Yalidine COD integration with dz-sandbox',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
