import Link from "next/link";
import { Laptop, AlertTriangle, CheckCircle, Clock, Plus, List as ListIcon, ArrowRightLeft, ShieldAlert, RotateCcw, Package } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

export const revalidate = 0;

const ACTION_ICONS: Record<string, React.ElementType> = {
  ISSUANCE: ArrowRightLeft,
  RETURN: RotateCcw,
  FAULT_DEPOSIT: ShieldAlert,
  SNATCH_REPORT: AlertTriangle,
  DISPOSAL: Package,
};

const ACTION_COLORS: Record<string, string> = {
  ISSUANCE: 'bg-blue-100 text-blue-700',
  RETURN: 'bg-green-100 text-green-700',
  FAULT_DEPOSIT: 'bg-destructive/10 text-destructive',
  SNATCH_REPORT: 'bg-orange-100 text-orange-700',
  DISPOSAL: 'bg-muted text-muted-foreground',
};

const ACTION_VERBS: Record<string, string> = {
  ISSUANCE: 'was ISSUED to',
  RETURN: 'was RETURNED by',
  FAULT_DEPOSIT: 'was logged as FAULTY by',
  SNATCH_REPORT: 'was reported SNATCHED by',
  DISPOSAL: 'was DISPOSED by',
};

import { getSession } from "@/lib/auth";
import { ActiveSiteSwitcher } from "@/components/ActiveSiteSwitcher";

export default async function Dashboard() {
  const session = await getSession();
  const role = session?.role || 'moderator';
  const assignedLocationId = session?.assigned_location_id || null;
  const assignedLocationIds = session?.assigned_location_ids || [];

  const { data: allAssets } = await supabase.from('assets').select('id, status, assigned_to');

  let totalAssets = 0, availableAssets = 0, assignedAssets = 0, faultyAssets = 0;
  if (allAssets) {
    totalAssets = allAssets.length;
    for (const asset of allAssets) {
      const isBad = ['Faulty', 'Snatched', 'Damaged'].includes(asset.status);
      const isAssigned = asset.assigned_to && asset.assigned_to.trim() !== '' && asset.assigned_to.toLowerCase() !== 'unassigned';
      if (isBad) faultyAssets++;
      else if (isAssigned) assignedAssets++;
      else availableAssets++;
    }
  }

  // Fetch custody feed
  const { data: custodyFeed } = await supabase
    .from('custody_ledger')
    .select(`
      id, action_type, recipient_name, created_at,
      inventory_items!custody_ledger_item_id_fkey(name, serial_number)
    `)
    .order('created_at', { ascending: false })
    .limit(10);

  const { data: recentActivityData } = await supabase.from('assets').select('*').order('created_at', { ascending: false }).limit(5);

  const recentActivity = (recentActivityData || []).map((item) => ({
    id: item.id,
    action: 'Logged',
    asset: item.laptop_name || item.serial_number,
    user: item.assigned_to || 'System',
    time: new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    status: item.status,
  }));

  const { data: locationsData } = await supabase.from('locations').select('id, name');
  const locations = locationsData || [];

  const metrics = {
    totalAssets: totalAssets || 0,
    available: availableAssets || 0,
    assigned: assignedAssets || 0,
    faulty: faultyAssets || 0,
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary">Dashboard</h2>
          <p className="text-muted-foreground mt-1">Overview of your IT inventory and recent activities.</p>
        </div>
      </div>

      {role === 'site_manager' && assignedLocationIds.length > 1 && (
        <ActiveSiteSwitcher
          currentLocationId={assignedLocationId}
          assignedLocationIds={assignedLocationIds}
          locations={locations}
        />
      )}

      {/* Metrics */}
      <div className={`grid gap-4 md:grid-cols-2 ${role === 'site_manager' ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
            <Laptop className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{metrics.totalAssets}</div><p className="text-xs text-muted-foreground">Total registered</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{metrics.available}</div><p className="text-xs text-muted-foreground">Ready for assignment</p></CardContent>
        </Card>
        {role !== 'site_manager' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Assigned</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{metrics.assigned}</div><p className="text-xs text-muted-foreground">Currently in use</p></CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Faulty / Damaged</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{metrics.faulty}</div><p className="text-xs text-muted-foreground">Needs attention</p></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Custody Feed */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ArrowRightLeft className="h-5 w-5 text-primary" />Custody Ledger Feed</CardTitle>
            <CardDescription>Live log of issuances, returns, and status changes.</CardDescription>
          </CardHeader>
          <CardContent>
            {!custodyFeed || custodyFeed.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                <ArrowRightLeft className="h-8 w-8 mx-auto text-muted/30 mb-2" />
                No custody events yet. Issue or return an item from the Inventory page.
              </div>
            ) : (
              <div className="space-y-3">
                {(custodyFeed as any[]).map(entry => {
                  const Icon = ACTION_ICONS[entry.action_type] || ArrowRightLeft;
                  const itemName = entry.inventory_items?.name || 'Unknown Item';
                  const serial = entry.inventory_items?.serial_number;
                  const verb = ACTION_VERBS[entry.action_type] || 'was updated by';
                  const colorClass = ACTION_COLORS[entry.action_type] || 'bg-muted text-muted-foreground';
                  const date = new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                  return (
                    <div key={entry.id} className="flex items-start gap-3 p-3 rounded-xl border border-muted/40 hover:bg-muted/5 transition-colors">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                        <Icon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-bold text-foreground">{itemName}</span>
                          {serial && <span className="text-muted-foreground font-mono text-xs ml-1">({serial})</span>}{' '}
                          <span className="text-muted-foreground">{verb}</span>{' '}
                          <span className="font-semibold text-primary">{entry.recipient_name}</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{date}</p>
                      </div>
                      <Badge className={`text-[10px] px-1.5 border-none shrink-0 ${colorClass}`}>{entry.action_type}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common inventory tasks.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Link href="/inventory/add" className={buttonVariants({ variant: "default", size: "lg", className: "w-full justify-start h-12" })}>
              <Plus className="mr-2 h-5 w-5" />Add New Asset
            </Link>
            <Link href="/inventory" className={buttonVariants({ variant: "outline", size: "lg", className: "w-full justify-start h-12" })}>
              <ListIcon className="mr-2 h-5 w-5" />View Full Inventory
            </Link>
            <Link href="/software-vault" className={buttonVariants({ variant: "outline", size: "lg", className: "w-full justify-start h-12" })}>
              <Package className="mr-2 h-5 w-5" />Software Vault
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent Asset Activity */}
      {recentActivity.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Asset Additions</CardTitle>
            <CardDescription>Latest items added to inventory.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center gap-3">
                  <div className="flex-1 space-y-0.5">
                    <p className="text-sm font-medium">{activity.asset}</p>
                    <p className="text-xs text-muted-foreground">Assigned to: {activity.user}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="text-xs text-muted-foreground">{activity.time}</div>
                    <Badge variant={['Faulty', 'Damaged', 'Snatched'].includes(activity.status) ? 'destructive' : 'secondary'}>
                      {activity.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
