import type {
    ReforgedPresetImportFailure,
    ReforgedPresetImportFailureCode,
    ReforgedPresetImportInput,
    ReforgedPresetImportResult,
    ReforgedPresetImportSource,
} from '@/contracts/preset';
import { parsePresetJson, ReforgedPresetParseError } from '@/parsers/presetJson';

export function importPreset(input: ReforgedPresetImportInput): ReforgedPresetImportResult {
    const source = createImportSource(input);

    if (source.format !== 'json') {
        return failure(source, 'unsupported-format', 'Preset import currently supports JSON files only.');
    }

    if (!input.text?.trim()) {
        return failure(source, 'missing-content', 'Preset JSON import requires text content.');
    }

    try {
        const { preset, warnings } = parsePresetJson(input.text, {
            fallbackName: getBaseFileName(input.fileName),
        });

        return {
            ok: true,
            preset,
            source,
            warnings,
        };
    } catch (error) {
        if (error instanceof ReforgedPresetParseError) {
            return failure(source, error.code, error.message);
        }

        return failure(source, 'invalid-json', describeError(error));
    }
}

function createImportSource(input: ReforgedPresetImportInput): ReforgedPresetImportSource {
    const extension = getLowercaseExtension(input.fileName);
    const mimeType = input.mimeType?.toLowerCase();
    const isJson = extension === 'json' || mimeType === 'application/json' || Boolean(mimeType?.endsWith('+json'));

    return {
        fileName: input.fileName,
        format: isJson ? 'json' : 'unknown',
    };
}

function failure(
    source: ReforgedPresetImportSource,
    code: ReforgedPresetImportFailureCode,
    message: string,
): ReforgedPresetImportFailure {
    return {
        ok: false,
        code,
        message,
        source,
    };
}

function getBaseFileName(fileName: string): string {
    const base = fileName.split(/[\\/]/).pop() ?? fileName;
    return base.replace(/\.[^.]+$/, '');
}

function getLowercaseExtension(fileName: string): string {
    const match = /\.([^.]+)$/.exec(fileName);
    return match ? match[1].toLowerCase() : '';
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
