'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, Sparkles, Wand2, Eraser, ScanSearch, ImagePlus } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import type { CreditsSummary, Tier } from '@/lib/credits';
import { PRICING_TIERS } from '@/lib/constants';
import Link from 'next/link';

const opConfig = {
    portrait: { icon: Sparkles, label: 'Portraits', color: '#8b5cf6' },
    enhance: { icon: Wand2, label: 'Enhancements', color: '#3b82f6' },
    bg_remove: { icon: Eraser, label: 'Background Removals', color: '#22c55e' },
    image_gen: { icon: ImagePlus, label: 'Image Gens', color: '#ec4899' },
    prompt_reversal: { icon: ScanSearch, label: 'Prompt Reversals (Daily)', color: '#f97316' },
};

export function CreditsWidget() {
    const [summary, setSummary] = useState<CreditsSummary | null>(null);
    const [tier, setTier] = useState<Tier>('free');
    const [loading, setLoading] = useState(true);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    useEffect(() => {
        async function fetchCredits() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const { data: profile } = await supabase.from('profiles').select('tier').eq('id', user.id).single();
                if (profile?.tier) setTier(profile.tier as Tier);

                const res = await fetch('/api/credits/check');
                const data = await res.json();
                if (data.summary) {
                    setSummary(data.summary);
                }
            } catch (error) {
                console.error('Failed to fetch credits:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchCredits();
    }, []);

    if (loading) {
        return <div className="h-32 rounded-2xl skeleton mb-8" />;
    }

    const currentTierDetails = PRICING_TIERS.find(t => t.id === tier) || PRICING_TIERS[0];
    const isFree = tier === 'free';

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-8 glass rounded-2xl p-6 relative overflow-hidden transition-all border ${isFree ? 'border-white/[0.08]' : 'border-violet-500/30'}`}
        >
            {/* Background Glow for Premium */}
            {!isFree && (
                <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-violet-500/10 blur-3xl rounded-full pointer-events-none" />
            )}

            <div className="flex flex-col md:flex-row gap-6 md:items-center justify-between relative z-10">

                {/* Tier Info */}
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isFree ? 'bg-white/[0.06] text-white/60' : 'bg-violet-500/20 text-violet-400'}`}>
                            <Crown className="h-4 w-4" />
                        </div>
                        <h2 className="text-xl font-bold text-white tracking-tight">
                            {currentTierDetails.name}
                        </h2>
                    </div>
                    <p className="text-sm text-white/50 mb-4 max-w-sm">
                        {isFree
                            ? "You are on the free tier. Upgrade to unlock more generations and features."
                            : "Enjoy your premium generation limits. Thanks for supporting AuraShot!"}
                    </p>
                    {isFree && (
                        <Link href="/pricing" className="inline-block px-4 py-2 bg-white text-black text-sm font-semibold rounded-xl hover:bg-white/90 transition-colors">
                            Upgrade Pack
                        </Link>
                    )}
                </div>

                {/* Credits Grid */}
                {summary ? (
                    <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
                        {Object.entries(opConfig).map(([key, cfg]) => {
                            const stat = summary[key as keyof CreditsSummary];
                            if (!stat || stat.limit === 0) return null; // Don't show if unavaiable in this tier

                            const Icon = cfg.icon;
                            const percent = Math.min(100, (stat.used / stat.limit) * 100);
                            const isAlmostEmpty = stat.remaining <= 1;

                            return (
                                <div key={key} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
                                            <span className="text-[10px] uppercase font-bold tracking-wider text-white/40">{cfg.label}</span>
                                        </div>
                                        <div className="flex items-end gap-1 mb-2">
                                            <span className={`text-xl font-bold ${isAlmostEmpty ? 'text-red-400' : 'text-white'}`}>
                                                {stat.remaining}
                                            </span>
                                            <span className="text-xs text-white/30 mb-1">/ {stat.limit} left</span>
                                        </div>
                                    </div>
                                    {/* Progress bar */}
                                    <div className="w-full h-1.5 bg-white/[0.05] rounded-full overflow-hidden mt-1">
                                        <div
                                            className={`h-full rounded-full transition-all`}
                                            style={{
                                                width: `${percent}%`,
                                                backgroundColor: percent > 90 ? '#ef4444' : cfg.color // Red if almost empty
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 w-full opacity-50">
                        {/* Loading skeletons for grid */}
                        {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl skeleton bg-white/[0.02]" />)}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
