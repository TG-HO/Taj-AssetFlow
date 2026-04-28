'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, PackagePlus, List, Settings, Laptop, Users, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logout } from '@/app/login/actions';
import { Button } from '@/components/ui/button';

export function Sidebar({ userRole }: { userRole?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const links = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'View Inventory', href: '/inventory', icon: List },
    { name: 'Add Asset', href: '/inventory/add', icon: PackagePlus },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  if (userRole === 'superadmin') {
    links.push({ name: 'Users', href: '/users', icon: Users });
    links.push({ name: 'Admin Logs', href: '/admin-logs', icon: List });
  }

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <aside className="w-64 h-screen bg-white border-r border-border flex flex-col fixed left-0 top-0 z-50 shadow-sm">
      <div className="p-6 flex items-center gap-3 border-b border-border/50">
        <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-md">
          <Laptop size={24} />
        </div>
        <div>
          <h1 className="font-bold text-xl tracking-tight text-primary">Taj AssetFlow</h1>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">IT Inventory</p>
        </div>
      </div>
      
      <nav className="flex-1 px-4 py-6 space-y-2">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href || (pathname.startsWith(link.href) && link.href !== '/');
          
          return (
            <Link
              key={link.name}
              href={link.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm font-medium",
                isActive 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
              )}
            >
              <Icon size={18} />
              {link.name}
            </Link>
          );
        })}
      </nav>
      
      <div className="p-4 border-t border-border/50">
        <Button 
          variant="ghost" 
          className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10" 
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
