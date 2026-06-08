import type {
    ReforgedWorldbookImportFailure,
    ReforgedWorldbookImportFailureCode,
    ReforgedWorldbookImportInput,
    ReforgedWorldbookImportResult,
    ReforgedWorldbookImportSource,
} from '@/contracts/worldbook';
import { parseWorldbookJson, ReforgedWorldbookParseError } from '@/parsers/worldbookJson';

export function importWorldbook(input: ReforgedWorldbookImportInput): ReforgedWorldbookImportResult {
    const source = createImportSource(input);

    if (source.format !== 'json') {
        return failure(source, 'unsupported-format', 'Worldbook import currently supports JSON files only.');
    }

    if (!input.text?.trim()) {
        return failure(source, 'missing-content', 'Worldbook JSON import requires text content.');
    }

    try {
        const worldbook = parseWorldbookJson(input.text, {
            fallbackName: getBaseFileName(input.fileName),
        });

        return {
            ok: true,
            worldbook,
            source,
            warnings: [],
        };
    } catch (error) {
        if (error instanceof ReforgedWorldbookParseError) {
            return failure(source, error.code, error.message);
        }

        return failure(source, 'invalid-json', describeError(error));
    }
}

export function detectWorldbookImportFormat(
    input: Pick<ReforgedWorldbookImportInput, 'fileName' | 'mimeType'>,
): ReforgedWorldbookImportSource['format'] {
    const extension = getLowercaseExtension(input.fileName);
    if (extension === 'json') {
        return 'json';
    }

    const mimeType = input.mimeType?.toLowerCase();
    if (mimeType === 'application/json' || mimeType?.endsWith('+json')) {
        return 'json';
    }

    return 'unknown';
}

function createImportSource(input: ReforgedWorldbookImportInput): ReforgedWorldbookImportSource {
    return {
        fileName: input.fileName,
        mimeType: input.mimeType,
        format: detectWorldbookImportFormat(input),
    };
}

function failure(
    source: ReforgedWorldbookImportSource,
    code: ReforgedWorldbookImportFailureCode,
    message: string,
): ReforgedWorldbookImportFailure {
    return {
        ok: false,
        code,
        message,
        source,
        warnings: [],
    };
}

function getLowercaseExtension(fileName: string): string {
    const match = /\.([^.]+)$/.exec(fileName.trim());
    return match?.[1]?.toLowerCase() ?? '';
}

function getBaseFileName(fileName: string): string {
    const trimmed = fileName.trim();
    return trimmed.replace(/\.[^.]+$/, '') || 'Imported Worldbook';
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
