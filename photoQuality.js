// Client-side photo compression, shared by every place spanSense uploads a
// structure/inspection photo (inspection/photo.js, author/addStructure.html,
// field/js/app.js) - Field previously pushed the raw camera File straight
// into IndexedDB with no size check at all, only failing once it tried to
// sync against the server's upload ceiling. Compressing at capture/pick time
// avoids that, and keeps the same quality presets in sync with the estimates
// shown in the Account page's Uploads & Storage card and Field's Settings
// screen.
//
// The server's org-configurable max_upload_mb (see /api/org-settings) is
// still the real backstop - this is a bandwidth/UX optimization, not the
// enforcement point.
(function (global) {
    const PHOTO_QUALITY_PRESETS = {
        original: null, // no resize/recompress
        high: { maxEdge: 2400, jpegQuality: 0.88 },
        balanced: { maxEdge: 1600, jpegQuality: 0.75 },
        data_saver: { maxEdge: 1000, jpegQuality: 0.6 }
    };

    // Compresses a File/Blob down to the given quality preset. Resolves with
    // the original file unchanged if: the preset is 'original', the file
    // isn't a raster image (SVG included - resizing it would rasterize a
    // vector graphic), or compression didn't actually shrink it (a small
    // photo re-encoded at a lower quality can end up bigger, not smaller).
    function compressImageFile(file, qualityKey) {
        const preset = PHOTO_QUALITY_PRESETS[qualityKey] || PHOTO_QUALITY_PRESETS.balanced;
        if (!preset || !file || !file.type || !file.type.startsWith('image/') || file.type === 'image/svg+xml') {
            return Promise.resolve(file);
        }
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                let width = img.naturalWidth, height = img.naturalHeight;
                const longEdge = Math.max(width, height);
                if (longEdge > preset.maxEdge) {
                    const scale = preset.maxEdge / longEdge;
                    width = Math.round(width * scale);
                    height = Math.round(height * scale);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (!blob || blob.size >= file.size) { resolve(file); return; }
                    const newName = (file.name || 'photo.jpg').replace(/\.\w+$/, '.jpg');
                    resolve(new File([blob], newName, { type: 'image/jpeg' }));
                }, 'image/jpeg', preset.jpegQuality);
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
            img.src = url;
        });
    }

    function formatMb(bytes) {
        return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
    }

    global.PhotoQuality = { PRESETS: PHOTO_QUALITY_PRESETS, compressImageFile, formatMb };
})(window);
