import type { ReforgedWorldbookImportInput } from '@/contracts/worldbook';

export interface ReforgedWorldbookImportFileLike {
    name: string;
    type?: string;
    text: () => Promise<string>;
}

export async function createWorldbookImportInputFromFile(
    file: ReforgedWorldbookImportFileLike,
): Promise<ReforgedWorldbookImportInput> {
    return {
        fileName: file.name.trim() || 'worldbook',
        mimeType: file.type || undefined,
        text: await file.text(),
    };
}
