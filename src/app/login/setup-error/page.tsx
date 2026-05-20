'use client';

import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ArrowLeft, HelpCircle } from "lucide-react";

export default function SetupErrorPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-muted/20 absolute inset-0 z-[100] px-4">
      <Card className="w-full max-w-md shadow-lg border-destructive/20 bg-card text-card-foreground overflow-hidden relative">
        {/* Red Accent line on top of Card */}
        <div className="h-1.5 w-full bg-destructive"></div>

        <CardHeader className="space-y-4 items-center text-center pb-6 pt-8">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive shadow-sm">
            <ShieldAlert size={26} />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold tracking-tight text-destructive">
              Access Restriction
            </CardTitle>
            <p className="text-muted-foreground text-sm font-medium">
              Taj AssetFlow Multi-Tenant Auth
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 text-center">
          {/* Main required banner message */}
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
            <h3 className="font-semibold text-base mb-1">Configuration Error</h3>
            <p className="text-sm leading-relaxed">
              User profile missing. Contact Support.
            </p>
          </div>

          <p className="text-muted-foreground text-xs leading-relaxed max-w-xs mx-auto">
            Your login credentials are valid, but your user account has not been bound to a company profile. Please request your IT administrator to initialize your profile.
          </p>
        </CardContent>

        <CardFooter className="pt-4 pb-6 flex flex-col items-center gap-3 border-t border-border/50 bg-muted/5">
          <Link href="/login" className="w-full">
            <Button variant="outline" className="w-full gap-2 border-border text-muted-foreground hover:bg-muted bg-transparent">
              <ArrowLeft size={16} />
              Return to Login
            </Button>
          </Link>
          
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60 font-medium">
            <HelpCircle size={12} />
            <span>ID Code: ERR_PROFILE_NOT_FOUND</span>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
