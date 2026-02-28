/**
 * app/api/tools/image-gen/route.ts
 *
 * General-purpose image generation — free for all tiers, no watermark.
 *
 * POST body:
 *   prompt:        string   — text description of desired image
 *   image_base64?: string   — optional base64 image (triggers img-guided gen)
 *   aspect_ratio?: string   — e.g. "1:1", "16:9", "3:4" (default: "auto")
 *
 * Model routing:
 *   With image → fal-ai/nano-banana-2/edit  (image-guided, Gemini Flash)
 *   Text only  → fal-ai/nano-banana-2       (text-to-image, Gemini Flash)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { generateImageNanaBanana2 } from '@/lib/api/fal';
import { checkCredits, deductCredits, getCreditsRemaining } from '@/lib/credits';
import { applyWatermark } from '@/lib/watermark';

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        // Auth check
        const supabase = createClient();
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Profile / tier check
        const adminDb = createAdminClient() as any;
        const { data: profile } = await adminDb
            .from('profiles')
            .select('tier')
            .eq('id', user.id)
            .single();

        const tier = profile?.tier ?? 'free';

        // Credit check
        const creditCheck = await checkCredits(user.id, 'image_gen');
        if (!creditCheck.allowed) {
            return NextResponse.json(
                {
                    error: 'Image generation credits exhausted. Upgrade to continue.',
                    used: creditCheck.used,
                    limit: creditCheck.limit,
                },
                { status: 403 },
            );
        }

        // Parse body
        const body = await request.json();
        const {
            prompt,
            image_base64,
            aspect_ratio,
        }: { prompt: string; image_base64?: string; aspect_ratio?: string } = body;

        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
        }

        // Cap prompt length to prevent abuse
        const trimmedPrompt = prompt.trim().slice(0, 500);

        // Build image URL from base64 if provided
        let imageUrl: string | undefined;
        if (image_base64) {
            imageUrl = image_base64.startsWith('data:')
                ? image_base64
                : `data:image/jpeg;base64,${image_base64}`;
        }

        // Generate via nano-banana-2 (base for text, edit for image-guided)
        const result = await generateImageNanaBanana2(trimmedPrompt, imageUrl, aspect_ratio);

        if (!result.success || !result.url) {
            return NextResponse.json(
                { error: result.error ?? 'Image generation failed' },
                { status: 500 },
            );
        }

        let finalImageUrl = result.url;

        // Apply watermark for free tier
        if (tier === 'free') {
            const imageRes = await fetch(result.url);
            if (!imageRes.ok) throw new Error('Failed to fetch generated image for watermarking');
            const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
            const watermarked = await applyWatermark(imageBuffer);
            finalImageUrl = `data:image/png;base64,${watermarked.toString('base64')}`;
        }

        // Record in generations table for History/Gallery
        await deductCredits(user.id, 'image_gen', finalImageUrl);
        const creditsRemaining = await getCreditsRemaining(user.id);

        // Return in format the dashboard expects: data.images[]
        return NextResponse.json({
            data: {
                images: [finalImageUrl],
                enhanced_prompt: trimmedPrompt,
            },
            creditsRemaining,
        });

    } catch (err: any) {
        console.error('[image-gen/route] error:', err);
        return NextResponse.json(
            { error: err?.message ?? 'Image generation failed' },
            { status: 500 },
        );
    }
}
