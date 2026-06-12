import { describe, expect, it } from 'vitest';
import { parseChatJsonl, ReforgedChatJsonlParseError } from './chatJsonl';

const SAMPLE = [
    JSON.stringify({ chat_metadata: { integrity: 'x' }, user_name: 'unused', character_name: 'Seraphina' }),
    JSON.stringify({ name: 'Seraphina', is_user: false, is_system: false, send_date: '2026-06-11T15:50:12.745Z', mes: '*You wake up.*' }),
    JSON.stringify({ name: 'User', is_user: true, send_date: 1765467100000, mes: '这里是哪?' }),
    JSON.stringify({ name: 'Seraphina', is_user: false, send_date: '2026-06-11T15:52:00.000Z', mes: 'fallback', swipes: ['第一版回复', '第二版回复'], swipe_id: 1 }),
    JSON.stringify({ name: 'System', is_system: true, mes: 'hidden note' }),
    'not-json-garbage',
].join('\n');

describe('parseChatJsonl', () => {
    it('parses metadata, messages, swipes, and tolerates bad lines', () => {
        const parsed = parseChatJsonl(SAMPLE);

        expect(parsed.characterName).toBe('Seraphina');
        expect(parsed.userName).toBeNull();
        expect(parsed.messages).toHaveLength(3);

        expect(parsed.messages[0]).toMatchObject({
            role: 'assistant',
            content: '*You wake up.*',
            createdAt: '2026-06-11T15:50:12.745Z',
        });
        expect(parsed.messages[1].role).toBe('user');
        expect(parsed.messages[1].createdAt).toBe(new Date(1765467100000).toISOString());

        const swiped = parsed.messages[2];
        expect(swiped.content).toBe('第二版回复');
        expect(swiped.alternatives).toEqual(['第一版回复', '第二版回复']);
        expect(swiped.activeAlternativeIndex).toBe(1);

        expect(parsed.warnings.some((warning) => warning.includes('system'))).toBe(true);
        expect(parsed.warnings.some((warning) => warning.includes('not valid JSON'))).toBe(true);
    });

    it('throws typed errors for empty or message-less files', () => {
        expect(() => parseChatJsonl('')).toThrowError(ReforgedChatJsonlParseError);
        expect(() => parseChatJsonl(JSON.stringify({ user_name: 'a', character_name: 'b' })))
            .toThrowError(/no importable messages/);
    });
});
