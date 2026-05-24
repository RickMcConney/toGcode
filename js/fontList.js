const AVAILABLE_FONTS = [
    {
        value: 'fonts/Roboto-Regular.ttf',
        label: 'Roboto',
        previewFamily: 'Roboto'
    },
    {
        value: 'fonts/Jointly3.otf',
        label: 'Jointly3',
        previewFamily: 'Jointly3'
    },
    {
        value: 'fonts/NationalPark-ExtraLight.otf',
        label: 'National Park ExtraLight',
        previewFamily: 'National Park ExtraLight'
    },
    {
        value: 'fonts/NationalPark-Light.otf',
        label: 'National Park Light',
        previewFamily: 'National Park Light'
    },
    {
        value: 'fonts/NationalPark-Regular.otf',
        label: 'National Park Regular',
        previewFamily: 'National Park Regular'
    },
    {
        value: 'fonts/NationalPark-Medium.otf',
        label: 'National Park Medium',
        previewFamily: 'National Park Medium'
    },
    {
        value: 'fonts/NationalPark-SemiBold.otf',
        label: 'National Park SemiBold',
        previewFamily: 'National Park SemiBold'
    },
    {
        value: 'fonts/NationalPark-Bold.otf',
        label: 'National Park Bold',
        previewFamily: 'National Park Bold'
    },
    {
        value: 'fonts/NationalPark-ExtraBold.otf',
        label: 'National Park ExtraBold',
        previewFamily: 'National Park ExtraBold'
    }
];

const LOCAL_FONT_PREFIX = 'local-font:';
const localFontRegistry = new Map();
let localFontIdCounter = 1;

function getAvailableFonts() {
    const localFonts = Array.from(localFontRegistry.values()).map(entry => ({
        value: entry.id,
        label: entry.label,
        previewFamily: entry.previewFamily || entry.label,
        isLocal: true
    }));

    return [...AVAILABLE_FONTS, ...localFonts];
}

function isLocalFontValue(fontValue) {
    return typeof fontValue === 'string' && fontValue.indexOf(LOCAL_FONT_PREFIX) === 0;
}

function getFontOptionByValue(fontValue) {
    return getAvailableFonts().find(font => font.value === fontValue) || null;
}

function getLocalFontEntry(fontValue) {
    if (!isLocalFontValue(fontValue)) return null;
    return localFontRegistry.get(fontValue) || null;
}

function clearLocalFonts() {
    localFontRegistry.clear();
    localFontIdCounter = 1;
}

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = event => resolve(event.target?.result || null);
        reader.onerror = () => reject(reader.error || new Error('Unable to read font file.'));
        reader.readAsArrayBuffer(file);
    });
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, offset + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }

    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

function sanitizeLocalFontLabel(label) {
    const trimmed = String(label || '').trim();
    return trimmed || 'Local Font';
}

function stripFileExtension(name) {
    return String(name || '').replace(/\.[A-Za-z0-9]+$/, '');
}

function buildLocalFontPreviewFamily(fontId) {
    return 'fk-preview-' + String(fontId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function registerLocalFont(source, options = {}) {
    const persist = options.persist !== false;
    let arrayBuffer;
    let label = options.label || '';
    let fileName = options.fileName || '';
    let fontId = options.id || null;

    if (source instanceof ArrayBuffer) {
        arrayBuffer = source.slice(0);
    } else {
        arrayBuffer = await readFileAsArrayBuffer(source);
        label = label || source.name;
        fileName = fileName || source.name;
    }

    if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength === 0) {
        throw new Error('Empty font file.');
    }

    if (typeof opentype === 'undefined' || typeof opentype.parse !== 'function') {
        throw new Error('Font parser is not available.');
    }

    const parsedFont = opentype.parse(arrayBuffer.slice(0));
    const parsedLabel = parsedFont?.names?.fullName?.en || parsedFont?.names?.fontFamily?.en || '';
    const resolvedLabel = sanitizeLocalFontLabel(
        parsedLabel
        || stripFileExtension(label)
        || fileName
    );
    const resolvedId = fontId || (LOCAL_FONT_PREFIX + (localFontIdCounter++));
    if (fontId) {
        const numericPart = parseInt(String(fontId).slice(LOCAL_FONT_PREFIX.length), 10);
        if (Number.isFinite(numericPart)) {
            localFontIdCounter = Math.max(localFontIdCounter, numericPart + 1);
        }
    }
    const previewFamily = buildLocalFontPreviewFamily(resolvedId);
    const entry = {
        id: resolvedId,
        label: resolvedLabel,
        fileName: fileName || resolvedLabel,
        previewFamily,
        font: parsedFont,
        buffer: arrayBuffer.slice(0),
        source: persist ? 'project' : 'session',
        persisted: persist
    };

    localFontRegistry.set(resolvedId, entry);

    if (typeof FontFace === 'function') {
        try {
            const face = new FontFace(previewFamily, entry.buffer.slice(0));
            face.load().then(loadedFace => {
                document.fonts.add(loadedFace);
            }).catch(() => {
                // Preview font is optional; vector generation still works without it.
            });
        } catch (error) {
            // Ignore preview registration failures; parsing already succeeded.
        }
    }

    return entry;
}

function serializeLocalFonts() {
    return Array.from(localFontRegistry.values())
        .filter(entry => entry.persisted !== false)
        .map(entry => ({
            id: entry.id,
            label: entry.label,
            fileName: entry.fileName,
            data: arrayBufferToBase64(entry.buffer)
        }));
}

async function restoreLocalFonts(fonts) {
    if (!Array.isArray(fonts) || fonts.length === 0) return;

    for (const font of fonts) {
        if (!font?.id || !font?.data) continue;
        try {
            await registerLocalFont(base64ToArrayBuffer(font.data), {
                id: font.id,
                label: font.label,
                fileName: font.fileName,
                persist: true
            });
        } catch (error) {
            console.warn('Unable to restore local font', font?.label || font?.id, error);
        }
    }
}

function getFontLabel(fontValue) {
    const option = getFontOptionByValue(fontValue);
    return option?.label || 'Unknown';
}
