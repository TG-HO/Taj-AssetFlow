'use client';

import { useState, use, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ArrowLeft, Edit, Laptop, HardDrive, User, History, MapPin, Calendar, Server, Trash2 } from "lucide-react";
import { getAsset, deleteAsset } from '../actions';
import { useRouter } from 'next/navigation';

export default function AssetPassportPage({ params }: { params: Promise<{ id: string }> }) {
  // Using React's use() to unwrap the params promise for Next 14+ / App Router
  const resolvedParams = use(params);
  const router = useRouter();
  const [asset, setAsset] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const data = await getAsset(resolvedParams.id);
      setAsset(data);
      setIsLoading(false);
    }
    loadData();
  }, [resolvedParams.id]);

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading asset details...</div>;
  }

  if (!asset) {
    return <div className="p-8 text-center text-destructive">Asset not found.</div>;
  }

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this asset?")) {
      const result = await deleteAsset(resolvedParams.id);
      if (result.success) {
        router.push('/inventory');
      } else {
        alert("Error deleting asset: " + result.error);
      }
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/inventory" className={buttonVariants({ variant: "ghost", size: "icon" })}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold tracking-tight text-primary">Asset Passport</h2>
              <Badge variant={
                asset.status === 'Faulty' ? 'destructive' : 
                asset.status === 'New' ? 'default' : 
                'secondary'
              } className="text-sm px-3 py-1">
                {asset.status}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-sm font-mono">{asset.serialNumber}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 text-destructive border-destructive/20 hover:bg-destructive/10" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
          <Link href={`/inventory/${resolvedParams.id}/edit`} className={buttonVariants({ variant: "default", className: "gap-2" })}>
            <Edit className="h-4 w-4" />
            Edit Asset
          </Link>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        
        {/* Main Column */}
        <div className="md:col-span-2 space-y-6">
          <Card className="border-t-4 border-t-primary shadow-sm">
            <CardHeader className="bg-muted/30 pb-4 border-b">
              <div className="flex items-center gap-2">
                <Laptop className="h-5 w-5 text-primary" />
                <CardTitle>Hardware Details</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Model Name</dt>
                  <dd className="mt-1 text-lg font-semibold">{asset.laptopName}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Serial Number</dt>
                  <dd className="mt-1 text-lg font-mono font-semibold text-primary">{asset.serialNumber}</dd>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-md"><Server className="h-5 w-5 text-primary" /></div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">Memory (RAM)</dt>
                    <dd className="mt-1 font-semibold">{asset.ram}</dd>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-md"><HardDrive className="h-5 w-5 text-primary" /></div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">Storage</dt>
                    <dd className="mt-1 font-semibold">{asset.storageCapacity} {asset.storageType}</dd>
                  </div>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="bg-muted/30 pb-4 border-b">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <CardTitle>Assignment Information</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Currently Assigned To</dt>
                  <dd className="mt-1 text-lg font-semibold">{asset.assignedTo || 'Unassigned'}</dd>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-md"><MapPin className="h-5 w-5 text-primary" /></div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">Location</dt>
                    <dd className="mt-1 font-semibold">{asset.location}</dd>
                  </div>
                </div>
                {asset.oldUsername && (
                  <div className="col-span-2 p-4 bg-muted/50 rounded-md border border-border/50">
                    <dt className="text-sm font-medium text-muted-foreground">Previous Owner</dt>
                    <dd className="mt-1 font-medium">{asset.oldUsername}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Side Column */}
        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="bg-muted/30 pb-4 border-b">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                <CardTitle>Lifecycle History</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-start gap-4">
                <Calendar className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Purchase Date</p>
                  <p className="font-medium">{asset.purchaseDate || 'N/A'}</p>
                </div>
              </div>
              <div className="w-px h-6 bg-border ml-2.5"></div>
              <div className="flex items-start gap-4">
                <Calendar className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Issue Date</p>
                  <p className="font-medium">{asset.issueDate || 'N/A'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Admin Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{asset.details || 'No additional details provided.'}</p>
            </CardContent>
          </Card>
        </div>
        
      </div>
    </div>
  );
}
