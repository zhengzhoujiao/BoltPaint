// Expansion utility functions ported from .BoltExpansion

export enum AspectRatio {
    Square = "1:1",
    Portrait = "3:4",
    Landscape = "4:3",
    Tall = "9:16",
    Wide = "16:9"
}

export enum ZoomLevel {
    One = 1.0,
    Small = 1.2,
    Medium = 1.5
}

export enum ProcessMode {
    AI = "ai",         // AI Auto-fill (smart expansion)
    Prompt = "prompt", // Custom Prompt AI
    Color = "color"    // Solid color padding (no AI)
}

// Helper map for ratio calculation
export const RATIO_MAP: Record<AspectRatio, number> = {
    [AspectRatio.Square]: 1,
    [AspectRatio.Portrait]: 3 / 4,
    [AspectRatio.Landscape]: 4 / 3,
    [AspectRatio.Tall]: 9 / 16,
    [AspectRatio.Wide]: 16 / 9
};

export const generateId = (): string => Math.random().toString(36).substring(2, 9);

export const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
};

/**
 * Creates a new image canvas with the target dimensions based on zoom and ratio.
 * Places the original image in the center and fills the rest with a background.
 * Background can be Magenta (for AI modes) or a custom color (for color mode).
 * This physically forces the "zoom out" effect and gives the AI a clear mask area to replace.
 * Includes a max dimension limit to prevent API errors with huge images.
 */
export const createPaddedImage = async (
    file: File,
    ratio: AspectRatio,
    zoom: ZoomLevel,
    mode: ProcessMode = ProcessMode.AI,
    color: string = '#FF00FF'
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const targetRatio = RATIO_MAP[ratio];
            const originalWidth = img.naturalWidth;
            const originalHeight = img.naturalHeight;
            const currentRatio = originalWidth / originalHeight;

            let baseW = originalWidth;
            let baseH = originalHeight;

            // 1. Determine the base box size that fits the image fully within the target aspect ratio
            if (currentRatio > targetRatio) {
                // Image is wider than target -> Increase height to match width/ratio
                baseH = originalWidth / targetRatio;
            } else {
                // Image is taller than target -> Increase width to match height*ratio
                baseW = originalHeight * targetRatio;
            }

            // 2. Apply Zoom Factor
            let finalW = Math.round(baseW * zoom);
            let finalH = Math.round(baseH * zoom);

            // 3. Safety Check: Max Dimensions (e.g. 2048px)
            // Gemini Flash Image works best under certain resolutions and large payloads can timeout.
            const MAX_DIMENSION = 2048;
            if (finalW > MAX_DIMENSION || finalH > MAX_DIMENSION) {
                const scale = Math.min(MAX_DIMENSION / finalW, MAX_DIMENSION / finalH);
                finalW = Math.round(finalW * scale);
                finalH = Math.round(finalH * scale);
            }

            const canvas = document.createElement('canvas');
            canvas.width = finalW;
            canvas.height = finalH;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error("Canvas context failed"));
                return;
            }

            // 4. Fill with background color
            // For AI/Prompt/Color modes going to backend: use Magenta (#FF00FF) as mask color
            ctx.fillStyle = '#FF00FF';
            ctx.fillRect(0, 0, finalW, finalH);

            // 5. Draw original image centered
            const idealW = baseW * zoom;
            const physicalScale = finalW / idealW; // 1.0 if not clamped

            const drawWidth = originalWidth * physicalScale;
            const drawHeight = originalHeight * physicalScale;

            const x = (finalW - drawWidth) / 2;
            const y = (finalH - drawHeight) / 2;

            // Use high quality smoothing
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            ctx.drawImage(img, x, y, drawWidth, drawHeight);

            // Return as PNG to avoid compression artifacts on the flat color
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
};
