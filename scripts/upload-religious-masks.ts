/**
 * scripts/upload-religious-masks.ts
 *
 * Uploads pre-made face masks for religious templates from public/mask1/
 * to Supabase Storage, and updates the mask_image column.
 *
 * Mask file → Template name mapping:
 *   hanuman.png          → Ancient Hanuman
 *   cosmicprotector.png  → Cosmic Protector Lord Vishnu
 *   maasaraswati.png     → Blessing from Maa Saraswati
 *   blessingaura.png     → Blessing Aura
 *   flutewithkrishna.png → Flute With Krishna
 *   divinelove.png       → Shiv Meditation
 *
 * Run:
 *   npx tsx scripts/upload-religious-masks.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Map each local mask file to its template name in the DB
const MASK_MAP: Record<string, string> = {
    'hanuman.png': 'Ancient Hanuman',
    'cosmicprotector.png': 'Cosmic Protector Lord Vishnu',
    'maasaraswati.png': 'Blessing from Maa Saraswati',
    'blessingaura.png': 'Blessing Aura',
    'flutewithkrishna.png': 'Flute With Krishna',
    'divinelove.png': 'Divine Love',
};

const MASKS_DIR = path.join(__dirname, '..', 'public', 'mask1');

async function main() {
    console.log('🎭 Uploading religious template masks...\n');

    for (const [fileName, templateName] of Object.entries(MASK_MAP)) {
        try {
            const filePath = path.join(MASKS_DIR, fileName);

            if (!fs.existsSync(filePath)) {
                console.error(`❌ File not found: ${filePath}`);
                continue;
            }

            // 1. Look up the template ID by name
            const { data: template, error: fetchError } = await supabase
                .from('portrait_templates')
                .select('id, name, mask_image')
                .eq('name', templateName)
                .single();

            if (fetchError || !template) {
                console.error(`❌ Template "${templateName}" not found in DB:`, fetchError?.message);
                continue;
            }

            console.log(`⏳ ${templateName} (${template.id}) — uploading ${fileName}...`);

            // 2. Read the mask file
            const maskBuffer = fs.readFileSync(filePath);

            // 3. Upload to Supabase Storage
            const storagePath = `masks/${template.id}-mask.png`;
            const { error: uploadError } = await supabase.storage
                .from('templates')
                .upload(storagePath, maskBuffer, {
                    contentType: 'image/png',
                    upsert: true,
                });

            if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

            // 4. Get the public URL
            const { data: publicData } = supabase.storage
                .from('templates')
                .getPublicUrl(storagePath);

            // 5. Update mask_image in the DB
            const { error: updateError } = await supabase
                .from('portrait_templates')
                .update({ mask_image: publicData.publicUrl })
                .eq('id', template.id);

            if (updateError) throw new Error(`DB update failed: ${updateError.message}`);

            console.log(`✅ ${templateName} → ${publicData.publicUrl}\n`);
        } catch (err) {
            console.error(
                `❌ Failed for "${templateName}":`,
                err instanceof Error ? err.message : err,
            );
        }
    }

    console.log('🎉 Done!');
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
