'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function UsersPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/settings?tab=users');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[50vh] text-muted-foreground">
      <div className="text-center space-y-2">
        <p className="animate-pulse">Redirecting to Settings...</p>
      </div>
    </div>
  );
}
