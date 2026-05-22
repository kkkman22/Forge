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

const emit = defineEmits<{ close: [] }>();

async function fetchAuthStatus() {
  try { authStatus.value = await invoke<AuthStatus>("get_auth_status"); } catch {}
}
async function fetchSleepStatus() {
  try { sleepStatus.value = await invoke<SleepStatus>("get_sleep_status"); } catch {}
}

async function saveApiKey() {
  if (!apiKeyInput.value.trim()) return;
  saving.value = true; error.value = null; success.value = null;
  try {
    await invoke("store_api_key", { key: apiKeyInput.value.trim() });
    apiKeyInput.value = "";
    success.value = "API Key 已保存到 Keychain";
    await fetchAuthStatus();
  } catch (e) { error.value = String(e); }
  finally { saving.value = false; }
}

async function clearCredentials() {
  if (!confirm("确认清除所有凭据？")) return;
  try { await invoke("clear_credentials"); success.value = "凭据已清除"; await fetchAuthStatus(); }
  catch (e) { error.value = String(e); }
}

async function handleSetupSudoers() {
  settingUpSudoers.value = true; error.value = null;
  try {
    await invoke("setup_sudoers");
    success.value = "休眠控制已授权";
    await fetchSleepStatus();
  } catch (e) { error.value = String(e); }
  finally { settingUpSudoers.value = false; }
}

async function exportDiag() {
  try { const path = await invoke<string>("export_diagnostics"); success.value = `诊断包已导出: ${path}`; }
  catch (e) { error.value = String(e); }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

onMounted(async () => { await fetchAuthStatus(); await fetchSleepStatus(); });
</script>

<template>
  <div
    style="position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px)"
    @keydown="handleKeydown"
  >
    <div
      style="
        background: white;
        border-radius: 20px;
        box-shadow: 0 25px 60px rgba(0,0,0,0.15);
        width: 460px;
        max-width: calc(100vw - 40px);
        max-height: calc(100vh - 40px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      "
    >
      <!-- Header -->
      <div style="padding: 24px 24px 12px; flex-shrink: 0">
        <div style="display: flex; align-items: center; justify-content: space-between">
          <div>
            <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0; font-family: var(--font-display)">设置</h2>
            <p style="font-size: 14px; color: #94a3b8; margin: 4px 0 0">管理应用配置和凭据</p>
          </div>
          <button
            style="width: 36px; height: 36px; border-radius: 50%; background: #f1f5f9; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #94a3b8; flex-shrink: 0"
            @click="emit('close')"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>

      <!-- Scrollable sections -->
      <div style="flex: 1; overflow-y: auto; min-height: 0; padding: 12px 24px 24px">
        <div style="display: flex; flex-direction: column; gap: 12px">

          <!-- Section: 认证 -->
          <div style="background: #f8fafc; border-radius: 14px; padding: 20px">
            <h3 style="font-size: 13px; font-weight: 600; color: #475569; margin: 0 0 16px">认证</h3>

            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px">
              <span style="font-size: 13px; color: #64748b">当前状态</span>
              <span
                style="font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 20px"
                :style="{ color: authStatus.is_valid ? '#059669' : '#dc2626', background: authStatus.is_valid ? '#ecfdf5' : '#fef2f2' }"
              >{{ authStatus.is_valid ? '已配置 ✓' : '未配置' }}</span>
            </div>

            <div style="margin-bottom: 12px">
              <label style="display: block; font-size: 13px; color: #64748b; margin-bottom: 8px">Anthropic API Key</label>
              <div style="display: flex; gap: 8px">
                <input
                  v-model="apiKeyInput"
                  type="password"
                  style="flex: 1; padding: 10px 14px; border-radius: 12px; font-size: 13px; border: 1.5px solid #e2e8f0; background: white; outline: none; font-family: monospace; min-width: 0; color: #0f172a; box-sizing: border-box"
                  placeholder="sk-ant-..."
                  @keydown.enter="saveApiKey"
                />
                <button
                  :style="{ padding: '10px 18px', borderRadius: '12px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: saving || !apiKeyInput.trim() ? 'not-allowed' : 'pointer', color: 'white', background: saving || !apiKeyInput.trim() ? '#c7d2fe' : '#4f46e5' }"
                  :disabled="saving || !apiKeyInput.trim()"
                  @click="saveApiKey"
                >{{ saving ? "..." : "保存" }}</button>
              </div>
            </div>

            <div v-if="authStatus.mode === 'claude_code_session'" style="padding: 10px 14px; border-radius: 10px; background: #eff6ff; font-size: 12px; color: #3b82f6; margin-bottom: 10px">
              已检测到 Claude Code 会话，将自动复用。
            </div>

            <button style="font-size: 12px; color: #dc2626; background: none; border: none; cursor: pointer; font-weight: 500" @click="clearCredentials">清除凭据</button>
          </div>

          <!-- Section: 休眠控制 -->
          <div style="background: #f8fafc; border-radius: 14px; padding: 20px">
            <h3 style="font-size: 13px; font-weight: 600; color: #475569; margin: 0 0 16px">休眠控制</h3>

            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px">
              <span style="font-size: 13px; color: #64748b">sudoers 状态</span>
              <span
                style="font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 20px"
                :style="{ color: sleepStatus.sudoers_configured ? '#059669' : '#d97706', background: sleepStatus.sudoers_configured ? '#ecfdf5' : '#fffbeb' }"
              >{{ sleepStatus.sudoers_configured ? '已授权 ✓' : '未配置' }}</span>
            </div>

            <div v-if="!sleepStatus.sudoers_configured">
              <p style="font-size: 12px; color: #64748b; margin: 0 0 12px">休眠抑制需要 pmset 免密权限。</p>
              <button
                :style="{ padding: '10px 20px', borderRadius: '12px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: settingUpSudoers ? 'not-allowed' : 'pointer', color: 'white', background: settingUpSudoers ? '#c7d2fe' : '#4f46e5' }"
                :disabled="settingUpSudoers"
                @click="handleSetupSudoers"
              >{{ settingUpSudoers ? "授权中..." : "授权 pmset" }}</button>
            </div>
            <div v-else style="padding: 10px 14px; border-radius: 10px; background: #ecfdf5; font-size: 12px; color: #059669">
              pmset 免密权限已配置。
            </div>
          </div>

          <!-- Section: 日志 -->
          <div style="background: #f8fafc; border-radius: 14px; padding: 20px">
            <h3 style="font-size: 13px; font-weight: 600; color: #475569; margin: 0 0 16px">日志</h3>
            <div style="display: flex; align-items: center; justify-content: space-between">
              <label style="font-size: 13px; color: #64748b">日志级别</label>
              <select v-model="logLevel" style="padding: 8px 14px; border-radius: 10px; font-size: 13px; background: white; border: 1.5px solid #e2e8f0; outline: none">
                <option value="debug">Debug</option>
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="error">Error</option>
              </select>
            </div>
          </div>

          <!-- Section: 诊断 -->
          <div style="background: #f8fafc; border-radius: 14px; padding: 20px">
            <h3 style="font-size: 13px; font-weight: 600; color: #475569; margin: 0 0 16px">诊断</h3>
            <button style="padding: 10px 20px; border-radius: 12px; font-size: 13px; font-weight: 600; color: #475569; background: white; border: 1.5px solid #e2e8f0; cursor: pointer" @click="exportDiag">导出诊断包</button>
          </div>

          <!-- Feedback -->
          <div v-if="error" style="padding: 12px 16px; border-radius: 12px; background: #fef2f2; font-size: 13px; color: #dc2626">{{ error }}</div>
          <div v-if="success" style="padding: 12px 16px; border-radius: 12px; background: #ecfdf5; font-size: 13px; color: #059669">{{ success }}</div>

        </div>
      </div>
    </div>
  </div>
</template>
