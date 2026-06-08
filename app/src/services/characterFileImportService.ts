import type { ReforgedCharacterImportInput } from '@/contracts/character';
import { detectCharacterImportFormat } from './characterImportService';

// DRAFT: 待主干评审
export interface ReforgedCharacterImportFileLike {
    name: string;
    type?: string;
    text: () => Promise<string>;
    arrayBuffer: () => Promise<ArrayBuffer>;
}

export async function createCharacterImportInputFromFile(
    file: ReforgedCharacterImportFileLike,
): Promise<ReforgedCharacterImportInput> {
    const fileName = file.name.trim() || 'character-card';
    const mimeType = file.type || undefined;
    const format = detectCharacterImportFormat({ fileName, mimeType });

    if (format === 'png') {
        return {
            fileName,
            mimeType,
            bytes: await file.arrayBuffer(),
        };
    }

    return {
        fileName,
        mimeType,
        text: await file.text(),
    };
}
