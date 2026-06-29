const { createClient } = require('@supabase/supabase-js');

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'spansense-uploads';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false }
});

async function uploadFile(storagePath, buffer, contentType) {
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
        contentType,
        upsert: false
    });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    return storagePath;
}

async function deleteFile(storagePath) {
    if (!storagePath) return;
    const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
    if (error) console.error(`Supabase delete failed for ${storagePath}:`, error.message);
}

// The bucket is private, so every path needs a freshly-signed, time-limited
// URL rather than being servable directly - callers should sign right before
// sending a response, not store the signed URL itself.
async function getSignedUrl(storagePath, expiresInSeconds = 3600) {
    if (!storagePath) return null;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresInSeconds);
    if (error) {
        console.error(`Signed URL failed for ${storagePath}:`, error.message);
        return null;
    }
    return data.signedUrl;
}

module.exports = { uploadFile, deleteFile, getSignedUrl, BUCKET };
