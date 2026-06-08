declare module '@sillytavern/script' {
  export function generateRaw(
    params?: import('@/contracts/engine').HeadlessGenerationRequest,
  ): Promise<string>;
  export function generateRawData(
    params?: import('@/contracts/engine').HeadlessRawDataRequest,
  ): Promise<unknown>;
  export function Generate(...args: unknown[]): Promise<unknown>;
  export const eventSource: unknown;
  export function getContext(): unknown;
}

declare module '@sillytavern/scripts/openai' {
  export function sendOpenAIRequest(
    type: NonNullable<import('@/contracts/engine').HeadlessChatCompletionRequest['type']>,
    messages: import('@/contracts/engine').HeadlessChatCompletionRequest['messages'],
    signal: AbortSignal,
    options?: Pick<import('@/contracts/engine').HeadlessChatCompletionRequest, 'jsonSchema'>,
  ): Promise<unknown>;
}
