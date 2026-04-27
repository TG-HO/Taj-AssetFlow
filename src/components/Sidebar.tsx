'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, PackagePlus, List, Settings, Laptop } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();

  const links = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'View Inventory', href: '/inventory', icon: List },
    { name: 'Add Asset', href: '/inventory/add', icon: PackagePlus },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

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
      
      <div className="p-4 border-t border-border/50 text-xs text-center text-muted-foreground">
        &copy; {new Date().getFullYear()} Taj Gasoline
      </div>
    </aside>
  );
}
