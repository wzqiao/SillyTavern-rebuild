<script setup lang="ts">
import { computed, ref } from 'vue';
import { setMultiplayerProviderKeySecret, useConnectionStore, useMultiplayerStore } from '@/stores';
import { Button, Input } from '@/ui-kit';

const multiplayerStore = useMultiplayerStore();
const connectionStore = useConnectionStore();

const serverUrl = ref(multiplayerStore.serverUrl);
const roomId = ref('');
const nickname = ref('');
const password = ref('');
const title = ref('');
const providerKey = ref('');
const busy = ref(false);
const notice = ref<string | null>(null);

const participantCount = computed(() => multiplayerStore.participants.length);
const connection = computed(() => connectionStore.appliedDraft);
const canCreateOrJoin = computed(() => (
    nickname.value.trim().length > 0 &&
    password.value.trim().length > 0 &&
    !busy.value
));
const canSubmitKey = computed(() => (
    multiplayerStore.isConnected &&
    connection.value &&
    providerKey.value.trim().length > 0 &&
    !busy.value
));

async function createRoom(): Promise<void> {
    if (!canCreateOrJoin.value) {
        return;
    }

    await runBusy(async () => {
        multiplayerStore.setServerUrl(serverUrl.value);
        await multiplayerStore.createRoom({
            title: title.value.trim() || undefined,
            nickname: nickname.value.trim(),
            password: password.value,
        });
        roomId.value = multiplayerStore.room?.id ?? roomId.value;
        notice.value = multiplayerStore.lastError?.message ?? 'Room created.';
    });
}

async function joinRoom(): Promise<void> {
    if (!canCreateOrJoin.value || !roomId.value.trim()) {
        return;
    }

    await runBusy(async () => {
        const roomLocator = roomId.value.trim();
        multiplayerStore.setServerUrl(serverUrl.value);
        await multiplayerStore.joinRoom({
            ...(isRoomLink(roomLocator) ? { roomLink: roomLocator } : { roomId: roomLocator }),
            nickname: nickname.value.trim(),
            password: password.value,
        });
        notice.value = multiplayerStore.lastError?.message ?? 'Room joined.';
    });
}

async function submitProviderKey(): Promise<void> {
    const appliedConnection = connection.value;
    if (!canSubmitKey.value || !appliedConnection) {
        return;
    }

    await runBusy(async () => {
        setMultiplayerProviderKeySecret(providerKey.value);
        providerKey.value = '';
        await multiplayerStore.submitProviderKey({
            api: 'openai',
            baseUrl: appliedConnection.baseUrl,
            model: appliedConnection.model,
        });
        notice.value = multiplayerStore.lastError?.message ?? 'Provider key ready for your generation requests.';
    });
}

function disconnect(): void {
    multiplayerStore.disconnect();
    notice.value = 'Room socket closed.';
}

async function runBusy(task: () => Promise<void>): Promise<void> {
    busy.value = true;
    notice.value = null;
    try {
        await task();
    } finally {
        busy.value = false;
    }
}

function isRoomLink(value: string): boolean {
    return /^https?:\/\//.test(value) || value.includes('?room=') || value.includes('?roomId=');
}
</script>

<template>
    <section class="console-surface grid gap-3 rounded-[1.5rem] border border-cyan-200/14 bg-neutral-950/52 p-3 text-xs leading-5 text-neutral-300">
        <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0">
                <p class="font-display text-sm font-semibold text-neutral-50">
                    多人房间
                </p>
                <p class="mt-0.5 text-neutral-500">
                    {{ multiplayerStore.isConnected ? `房间 ${multiplayerStore.room?.id} · ${participantCount} 人` : '链接、昵称和房间密码加入。' }}
                </p>
            </div>
            <div class="flex items-center gap-2">
                <span
                    class="rounded-full border px-2 py-1"
                    :class="multiplayerStore.isConnected ? 'border-emerald-300/30 bg-emerald-300/12 text-emerald-100' : 'border-white/10 bg-white/5 text-neutral-400'"
                >
                    {{ multiplayerStore.socketConnected ? '在线' : multiplayerStore.status }}
                </span>
                <Button
                    v-if="multiplayerStore.room"
                    type="button"
                    size="sm"
                    variant="ghost"
                    @click="disconnect"
                >
                    断开
                </Button>
            </div>
        </div>

        <div class="grid gap-2 md:grid-cols-[1.2fr_0.8fr_0.8fr]">
            <Input
                v-model="serverUrl"
                label="Reforged 后端"
                placeholder="http://127.0.0.1:8787"
                inputmode="url"
                autocomplete="off"
                :disabled="busy"
            />
            <Input
                v-model="nickname"
                label="昵称"
                placeholder="旅人"
                autocomplete="nickname"
                :disabled="busy"
            />
            <Input
                v-model="password"
                label="房间密码"
                placeholder="进入口令"
                type="password"
                autocomplete="off"
                :disabled="busy"
            />
        </div>

        <div class="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
            <Input
                v-model="title"
                label="新房间标题"
                placeholder="午夜酒馆"
                autocomplete="off"
                :disabled="busy"
            />
            <Input
                v-model="roomId"
                label="房间 ID"
                placeholder="粘贴房间 ID 或链接"
                autocomplete="off"
                :disabled="busy"
            />
            <Button
                type="button"
                variant="outline"
                :loading="busy && !multiplayerStore.isConnected"
                :disabled="!canCreateOrJoin"
                @click="createRoom"
            >
                创建
            </Button>
            <Button
                type="button"
                :loading="busy && !multiplayerStore.isConnected"
                :disabled="!canCreateOrJoin || !roomId.trim()"
                @click="joinRoom"
            >
                加入
            </Button>
        </div>

        <div
            v-if="multiplayerStore.isConnected"
            class="grid gap-2 border-t border-white/8 pt-3 md:grid-cols-[1fr_auto] md:items-end"
        >
            <Input
                v-model="providerKey"
                label="你的 API Key"
                placeholder="只发送给后端瞬态 vault，不进房间事件"
                type="password"
                autocomplete="off"
                :disabled="busy || !connection"
                :hint="connection ? `使用连接页已应用的 ${connection.model}` : '先去连接页应用 baseURL 和模型。'"
            />
            <Button
                type="button"
                :disabled="!canSubmitKey"
                :loading="busy && providerKey.length > 0"
                @click="submitProviderKey"
            >
                启用生成
            </Button>
        </div>

        <div
            v-if="multiplayerStore.lastError || notice"
            class="rounded-[1.25rem] border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-amber-100"
        >
            {{ multiplayerStore.lastError?.message ?? notice }}
        </div>
    </section>
</template>
