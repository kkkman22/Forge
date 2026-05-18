<script setup lang="ts">
import { ref, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type { AuthStatus, SleepStatus } from "../types/index";

const authStatus = ref<AuthStatus>({ mode: "none", is_valid: false });
const sleepStatus = ref<SleepStatus>({ is_inhibited: false, sudoers_configured: false });
const apiKeyInput = ref("");
const saving = ref(false);
const settingUpSudoers = ref(false);
const error = ref<string | null>(null);
const success = ref<string | null>(null);
const logLevel = ref("info");

async function fetchAuthStatus() {
  try {
    authStatus.value = await invoke<AuthStatus>("get_auth_status");
  } catch {
    // Ignore
  }
}

async function fetchSleepStatus() {
  try {
    sleepStatus.value = await invoke<SleepStatus>("get_sleep_status");
  } catch {
    // Ignore
  }
}

async function saveApiKey() {
  if (!apiKeyInput.value.trim()) return;
  saving.value = true;
  error.value = null;
  success.value = null;
  try {
    await invoke("store_api_key", { key: apiKeyInput.value.trim() });
    apiKeyInput.value = "";
    success.value = "API Key 已保存到 Keychain";
    await fetchAuthStatus();
  } catch (e) {
    error.value = String(e);
  } finally {
    saving.value = false;
  }
}

async function clearCredentials() {
  if (!confirm("确认清除所有凭据？")) return;
  try {
    await invoke("clear_credentials");
    success.value = "凭据已清除";
    await fetchAuthStatus();
  } catch (e) {
    error.value = String(e);
  }
}

async function handleSetupSudoers() {
  settingUpSudoers.value = true;
  error.value = null;
  try {
    await invoke("setup_sudoers");
    success.value = "休眠控制已授权（sudoers 已配置）";
    await fetchSleepStatus();
  } catch (e) {
    error.value = String(e);
  } finally {
    settingUpSudoers.value = false;
  }
}

async function exportDiag() {
  try {
    const path = await invoke<string>("export_diagnostics");
    success.value = `诊断包已导出: ${path}`;
  } catch (e) {
    error.value = String(e);
  }
}

onMounted(async () => {
  await fetchAuthStatus();
  await fetchSleepStatus();
});
</script>

<template>
  <div class="min-h-screen bg-white" :style="{ fontFamily: 'var(--font-body)' }">
    <!-- Header -->
    <header
      class="sticky top-0 z-40 px-6 py-4 flex items-center gap-4"
      style="backdrop-filter: saturate(180%) blur(20px); background: rgba(255,255,255,0.85)"
    >
      <router-link
        to="/"
        class="text-[var(--color-primary)] text-[15px] hover:underline"
      >
        ← 返回
      </router-link>
      <h1
        class="text-[24px] font-semibold tracking-[-0.28px]"
        :style="{ fontFamily: 'var(--font-display)' }"
      >
        设置
      </h1>
    </header>

    <div class="px-6 py-4 space-y-8 max-w-[600px]">
      <!-- Auth section -->
      <section class="rounded-[var(--rounded-lg)] border border-[var(--color-hairline)] p-6">
        <h2 class="text-[19px] font-semibold mb-4" :style="{ fontFamily: 'var(--font-display)' }">
          认证
        </h2>

        <!-- Current status -->
        <div class="mb-4 flex items-center gap-2 text-[15px]">
          <span class="text-[var(--color-ink-muted)]">当前状态:</span>
          <span
            class="px-2.5 py-0.5 rounded-[var(--rounded-pill)] text-[13px] font-medium"
            :class="{
              'bg-[#e8f5e9] text-[#34c759]': authStatus.is_valid,
              'bg-[#ffeaea] text-[#ff3b30]': !authStatus.is_valid,
            }"
          >
            {{
              authStatus.mode === "api_key"
                ? "API Key ✓"
                : authStatus.mode === "claude_code_session"
                  ? "Claude Code 会话 ✓"
                  : "未配置"
            }}
          </span>
        </div>

        <!-- API Key input -->
        <div class="space-y-3">
          <label class="block text-[14px] font-medium text-[var(--color-ink-muted)]">
            Anthropic API Key
          </label>
          <div class="flex gap-2">
            <input
              v-model="apiKeyInput"
              type="password"
              class="flex-1 px-3 py-2.5 border border-[var(--color-hairline)] rounded-[var(--rounded-sm)] text-[17px] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              placeholder="sk-ant-..."
              @keydown.enter="saveApiKey"
            />
            <button
              class="px-5 py-2.5 rounded-[var(--rounded-pill)] text-[15px] bg-[var(--color-primary)] text-white font-medium active:scale-[0.97] transition-transform disabled:opacity-40"
              :disabled="saving || !apiKeyInput.trim()"
              @click="saveApiKey"
            >
              {{ saving ? "验证中..." : "保存" }}
            </button>
          </div>
        </div>

        <!-- Claude Code session info -->
        <div
          v-if="authStatus.mode === 'claude_code_session'"
          class="mt-3 p-3 rounded-[var(--rounded-sm)] bg-[#f5f5f7] text-[14px] text-[var(--color-ink-muted)]"
        >
          已检测到 Claude Code 会话 (~/.claude/.credentials.json)，将自动复用。
        </div>

        <!-- Clear credentials -->
        <div class="mt-4">
          <button
            class="text-[14px] text-[var(--color-error)] hover:underline"
            @click="clearCredentials"
          >
            清除凭据
          </button>
        </div>
      </section>

      <!-- Sleep suppression section -->
      <section class="rounded-[var(--rounded-lg)] border border-[var(--color-hairline)] p-6">
        <h2 class="text-[19px] font-semibold mb-4" :style="{ fontFamily: 'var(--font-display)' }">
          休眠控制
        </h2>

        <div class="mb-4 flex items-center gap-2 text-[15px]">
          <span class="text-[var(--color-ink-muted)]">sudoers 状态:</span>
          <span
            class="px-2.5 py-0.5 rounded-[var(--rounded-pill)] text-[13px] font-medium"
            :class="{
              'bg-[#e8f5e9] text-[#34c759]': sleepStatus.sudoers_configured,
              'bg-[#fff8e1] text-[#ff9500]': !sleepStatus.sudoers_configured,
            }"
          >
            {{ sleepStatus.sudoers_configured ? "已授权 ✓" : "未配置" }}
          </span>
        </div>

        <div v-if="!sleepStatus.sudoers_configured" class="space-y-3">
          <p class="text-[14px] text-[var(--color-ink-muted)]">
            休眠抑制需要 pmset 免密权限。点击下方按钮，输入管理员密码完成授权。
          </p>
          <button
            class="px-5 py-2.5 rounded-[var(--rounded-pill)] text-[15px] bg-[var(--color-primary)] text-white font-medium active:scale-[0.97] transition-transform disabled:opacity-40"
            :disabled="settingUpSudoers"
            @click="handleSetupSudoers"
          >
            {{ settingUpSudoers ? "授权中..." : "授权 pmset" }}
          </button>
        </div>

        <div v-else class="p-3 rounded-[var(--rounded-sm)] bg-[#f5f5f7] text-[14px] text-[var(--color-ink-muted)]">
          pmset 免密权限已配置，任务执行时可自动抑制系统休眠和合盖背光。
        </div>
      </section>

      <!-- Log section -->
      <section class="rounded-[var(--rounded-lg)] border border-[var(--color-hairline)] p-6">
        <h2 class="text-[19px] font-semibold mb-4" :style="{ fontFamily: 'var(--font-display)' }">
          日志
        </h2>
        <div class="flex items-center justify-between">
          <label class="text-[15px]">日志级别</label>
          <select
            v-model="logLevel"
            class="px-3 py-1.5 border border-[var(--color-hairline)] rounded-[var(--rounded-sm)] text-[15px] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          >
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
        </div>
      </section>

      <!-- Diagnostics -->
      <section class="rounded-[var(--rounded-lg)] border border-[var(--color-hairline)] p-6">
        <h2 class="text-[19px] font-semibold mb-4" :style="{ fontFamily: 'var(--font-display)' }">
          诊断
        </h2>
        <button
          class="px-5 py-2.5 border border-[var(--color-hairline)] rounded-[var(--rounded-sm)] text-[15px] hover:bg-[var(--color-surface-secondary)] transition-colors"
          @click="exportDiag"
        >
          导出诊断包
        </button>
      </section>

      <!-- Feedback -->
      <div
        v-if="error"
        class="p-3 rounded-[var(--rounded-sm)] bg-[#ffeaea] text-[var(--color-error)] text-[15px]"
      >
        {{ error }}
      </div>
      <div
        v-if="success"
        class="p-3 rounded-[var(--rounded-sm)] bg-[#e8f5e9] text-[#34c759] text-[15px]"
      >
        {{ success }}
      </div>
    </div>
  </div>
</template>
