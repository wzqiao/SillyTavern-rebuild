// DRAFT: 待主干评审

export interface ReforgedPresetSampling {
    temperature?: number;
    topP?: number;
    topK?: number;
    topA?: number;
    minP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    repetitionPenalty?: number;
    seed?: number;
    maxTokens?: number;
    maxContext?: number;
}
