<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { sendNotification, isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import type { Task, TaskInput } from "../types/index";
import { statusType, statusLabel } from "../types/index";
import TaskCard from "./TaskCard.vue";
import TaskFormDialog from "./TaskFormDialog.vue";
import ReviewPanel from "./ReviewPanel.vue";
import SettingsPage from "./SettingsPage.vue";

const tasks = ref<Task[]>([]);
const showSettings = ref(false);
const loading = ref(false);
const activeTab = ref<"today" | "done">("today");
const showForm = ref(false);
const editingTask = ref<Task | null>(null);
const reviewTask = ref<Task | null>(null);
const diffContent = ref("");
const reviewReport = ref("");
const errorMsg = ref("");
let errorTimer = 0;
function showError(msg: string) {
  errorMsg.value = msg;
  clearTimeout(errorTimer);
  errorTimer = window.setTimeout(() => { errorMsg.value = ""; }, 4000);
}
const detailTask = ref<Task | null>(null);
const detailLog = ref("");

const pendingTasks = computed(() =>
  tasks.value.filter(t => statusType(t.status) !== "completed")
);
const completedTasks = computed(() =>
  tasks.value.filter(t => statusType(t.status) === "completed")
);
const displayTasks = computed(() =>
  activeTab.value === "today" ? pendingTasks.value : completedTasks.value
);

async function fetchTasks() {
  loading.value = true;
  try {
    tasks.value = await invoke<Task[]>("list_tasks");
  } catch (e) {
    console.error("Failed to fetch tasks:", e);
  } finally {
    loading.value = false;
  }
}

async function handleStart(taskId: string) {
  try { await invoke("start_task", { taskId }); await fetchTasks(); }
  catch (e) { console.error(e); showError(String(e)); }
}
async function handleStop(taskId: string) {
  try { await invoke("stop_task", { taskId }); await fetchTasks(); }
  catch (e) { console.error(e); }
}
async function handleRetry(taskId: string) {
  try {
    const result = await invoke<string>("retry_task", { taskId });
    if (result) await invoke("start_task", { taskId });
    await fetchTasks();
  } catch (e) { console.error(e); showError(String(e)); }
}
async function handleRestart(taskId: string) {
  try {
    const result = await invoke<string>("restart_task", { taskId });
    if (result) await invoke("start_task", { taskId });
    await fetchTasks();
  } catch (e) { console.error(e); showError(String(e)); }
}
async function handleDelete(taskId: string) {
  if (!confirm("确认删除此任务？")) return;
  try { await invoke("delete_task", { taskId }); await fetchTasks(); }
  catch (e) { console.error(e); }
}
async function handleReview(taskId: string) {
  const task = tasks.value.find(t => t.id === taskId);
  if (!task) return;
  reviewTask.value = task;
  const lastExec = task.executions[task.executions.length - 1];
  const worktreePath = lastExec?.worktree_path ?? undefined;
  const branchName = lastExec?.branch_name ?? undefined;
  try { diffContent.value = await invoke<string>("get_diff", { taskId, repoPath: task.repo_path, worktreePath, branchName }); }
  catch { diffContent.value = ""; }
  try { const runId = task.status.type === 'awaiting_review' || task.status.type === 'completed' ? task.status.run_id : (task.status.type === 'failed' ? task.status.run_id : (task.status.type === 'running' ? task.status.run_id : "")); reviewReport.value = await invoke<string>("get_review_report", { taskId, runId, repoPath: task.repo_path, worktreePath }); } catch { reviewReport.value = ""; }
}
async function handleApprove(taskId: string) {
  try { await invoke("approve_task", { taskId }); reviewTask.value = null; await fetchTasks(); }
  catch (e) { console.error(e); }
}
async function handleReject(taskId: string, feedback: string) {
  try { await invoke("reject_task", { taskId, feedback }); reviewTask.value = null; await invoke("start_task", { taskId }); await fetchTasks(); }
  catch (e) { console.error(e); }
}
function handleEdit(taskId: string) {
  const task = tasks.value.find(t => t.id === taskId);
  if (task) { editingTask.value = task; showForm.value = true; }
}
async function handleDetail(taskId: string) {
  const task = tasks.value.find(t => t.id === taskId);
  if (!task) return;
  detailTask.value = task;
  detailLog.value = "";
  if (task.executions.length > 0) {
    const lastExec = task.executions[task.executions.length - 1];
    try { detailLog.value = await invoke<string>("get_task_log", { taskId: task.id, runId: lastExec.run_id, lines: 100 }); }
    catch { detailLog.value = ""; }
  }
}
function closeDetail() { detailTask.value = null; detailLog.value = ""; }
async function handleFormSubmit(input: TaskInput) {
  try {
    if (editingTask.value) await invoke("update_task", { taskId: editingTask.value.id, patch: input });
    else await invoke("create_task", { input });
    showForm.value = false; editingTask.value = null; await fetchTasks();
  } catch (e) { showError(String(e)); }
}
function handleFormCancel() { showForm.value = false; editingTask.value = null; }

onMounted(async () => {
  await fetchTasks();
  await listen<{ task_id: string; new_status: string }>("process-exit", (event) => {
    fetchTasks();
    if (event.payload.new_status === "awaiting_review") handleReview(event.payload.task_id);
  });
  await listen<{ task_id: string; phase: string | null; iteration: number | null; message: string | null }>("task-status-update", (event) => {
    const idx = tasks.value.findIndex(t => t.id === event.payload.task_id);
    if (idx !== -1) {
      const updated = { ...tasks.value[idx] };
      updated.metadata = { ...updated.metadata, _liveIteration: event.payload.iteration, _liveSummary: event.payload.message };
      tasks.value.splice(idx, 1, updated);
    }
  });
  await listen<{ title: string; body: string }>("notification-request", async (event) => {
    try {
      let granted = await isPermissionGranted();
      if (!granted) { const p = await requestPermission(); granted = p === "granted"; }
      if (granted) sendNotification({ title: event.payload.title, body: event.payload.body });
    } catch {}
  });
});
</script>

<template>
  <div style="min-height: 100%; font-family: var(--font-body)">

    <!-- Header -->
    <div style="padding: 32px 36px 24px">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px">
        <div>
          <h1 style="font-size: 26px; font-weight: 700; color: #0f172a; margin: 0; font-family: var(--font-display)">我的任务</h1>
          <p style="font-size: 14px; color: #94a3b8; margin: 4px 0 0">{{ pendingTasks.length }} 个进行中</p>
        </div>
        <div style="display: flex; align-items: center; gap: 12px">
          <button
            style="padding: 12px 24px; border-radius: 14px; font-size: 14px; font-weight: 600; color: #6366f1; background: #e0e7ff; border: none; cursor: pointer; display: flex; align-items: center; gap: 6px"
            @click="showSettings = true"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.4"/><path d="M8 1v2.5M8 12.5V15M1 8h2.5M12.5 8H15M3.05 3.05l1.6 1.6M11.35 11.35l1.6 1.6M3.05 12.95l1.6-1.6M11.35 4.65l1.6-1.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            设置
          </button>
          <button
            style="padding: 12px 28px; border-radius: 14px; font-size: 14px; font-weight: 600; color: white; background: #4f46e5; border: none; cursor: pointer; box-shadow: 0 4px 12px rgba(79,70,229,0.3)"
            @click="showForm = true; editingTask = null"
          >+ 新任务</button>
        </div>
      </div>

      <!-- Tab switcher -->
      <div style="display: flex; gap: 4px; background: #f1f5f9; border-radius: 12px; padding: 4px; width: fit-content">
        <button
          :style="{
            padding: '8px 24px',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s',
            background: activeTab === 'today' ? 'white' : 'transparent',
            color: activeTab === 'today' ? '#0f172a' : '#94a3b8',
            boxShadow: activeTab === 'today' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
          }"
          @click="activeTab = 'today'"
        >
          进行中 ({{ pendingTasks.length }})
        </button>
        <button
          :style="{
            padding: '8px 24px',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 500,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s',
            background: activeTab === 'done' ? 'white' : 'transparent',
            color: activeTab === 'done' ? '#0f172a' : '#94a3b8',
            boxShadow: activeTab === 'done' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
          }"
          @click="activeTab = 'done'"
        >
          已完成 ({{ completedTasks.length }})
        </button>
      </div>
    </div>

    <!-- Task list -->
    <div style="padding: 0 36px 36px">

      <!-- Loading -->
      <div v-if="loading" style="text-align: center; padding: 60px 0; color: #94a3b8; font-size: 15px">
        加载中...
      </div>

      <!-- Empty state -->
      <div v-else-if="displayTasks.length === 0" style="text-align: center; padding: 80px 0">
        <div style="width: 72px; height: 72px; margin: 0 auto 20px; border-radius: 20px; background: #f1f5f9; display: flex; align-items: center; justify-content: center; font-size: 32px">
          {{ activeTab === 'today' ? '📋' : '🎉' }}
        </div>
        <p style="font-size: 16px; font-weight: 500; color: #334155; margin: 0 0 4px">
          {{ activeTab === 'today' ? '暂无进行中的任务' : '还没有完成的任务' }}
        </p>
        <p style="font-size: 14px; color: #94a3b8; margin: 0">
          {{ activeTab === 'today' ? '点击「+ 新任务」开始创建' : '完成任务后会显示在这里' }}
        </p>
      </div>

      <!-- Task items -->
      <div v-else style="display: flex; flex-direction: column; gap: 10px">
        <TaskCard
          v-for="task in displayTasks"
          :key="task.id"
          :task="task"
          @start="handleStart"
          @stop="handleStop"
          @review="handleReview"
          @retry="handleRetry"
          @restart="handleRestart"
          @edit="handleEdit"
          @delete="handleDelete"
          @detail="handleDetail"
        />
      </div>
    </div>

    <!-- Task form dialog -->
    <TaskFormDialog v-if="showForm" :task="editingTask" @submit="handleFormSubmit" @cancel="handleFormCancel" />
    <!-- Review panel -->
    <ReviewPanel v-if="reviewTask" :task="reviewTask" :diff-content="diffContent" :review-report="reviewReport" @approve="handleApprove" @reject="handleReject" @close="reviewTask = null" />
    <!-- Settings dialog -->
    <SettingsPage v-if="showSettings" @close="showSettings = false" />

    <!-- Error toast -->
    <Transition name="toast">
      <div v-if="errorMsg" style="position: fixed; top: 24px; left: 50%; transform: translateX(-50%); z-index: 60">
        <div style="display: flex; align-items: center; gap: 12px; padding: 14px 20px; border-radius: 14px; background: white; box-shadow: 0 8px 30px rgba(0,0,0,0.12); border: 1px solid #fecaca; max-width: calc(100vw - 48px)">
          <div style="width: 28px; height: 28px; border-radius: 50%; background: #fef2f2; display: flex; align-items: center; justify-content: center; flex-shrink: 0">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 4v3.5M7 9.5v.5" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/><circle cx="7" cy="7" r="5.5" stroke="#dc2626" stroke-width="1.2"/></svg>
          </div>
          <span style="font-size: 14px; color: #0f172a; white-space: nowrap">{{ errorMsg }}</span>
          <button style="width: 28px; height: 28px; border-radius: 50%; background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #94a3b8; flex-shrink: 0" @click="errorMsg = ''">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>
    </Transition>

    <!-- Detail side panel -->
    <div v-if="detailTask" style="position: fixed; inset: 0; z-index: 50; display: flex" @keydown.escape="closeDetail">
      <div style="width: 40%; background: rgba(0,0,0,0.2); backdrop-filter: blur(4px)" @click="closeDetail" />
      <div style="width: 60%; background: white; display: flex; flex-direction: column; box-shadow: -8px 0 30px rgba(0,0,0,0.08); border-radius: 20px 0 0 20px">
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 24px 28px; border-bottom: 1px solid #f1f5f9">
          <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0; font-family: var(--font-display)">任务详情</h2>
          <button style="width: 32px; height: 32px; border-radius: 50%; background: #f1f5f9; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #64748b" @click="closeDetail">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div style="flex: 1; overflow-y: auto; padding: 28px">

          <!-- Section: 基本信息 -->
          <div style="background: #f8fafc; border-radius: 14px; padding: 20px; margin-bottom: 12px">
            <h3 style="font-size: 13px; font-weight: 600; color: #475569; margin: 0 0 16px 0">基本信息</h3>
            <div style="margin-bottom: 14px">
              <label style="display: block; font-size: 12px; color: #94a3b8; margin-bottom: 4px">任务标题</label>
              <span style="font-size: 14px; color: #0f172a; font-weight: 500">{{ detailTask.title }}</span>
            </div>
            <div style="margin-bottom: 14px">
              <label style="display: block; font-size: 12px; color: #94a3b8; margin-bottom: 4px">目标仓库</label>
              <span style="font-size: 13px; font-family: monospace; color: #0f172a; background: white; padding: 6px 10px; border-radius: 8px; display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ detailTask.repo_path }}</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px">
              <div>
                <label style="display: block; font-size: 12px; color: #94a3b8; margin-bottom: 4px">状态</label>
                <span style="font-size: 13px; font-weight: 500; color: #0f172a">{{ statusLabel(detailTask.status) }}</span>
              </div>
              <div>
                <label style="display: block; font-size: 12px; color: #94a3b8; margin-bottom: 4px">创建时间</label>
                <span style="font-size: 13px; color: #0f172a">{{ new Date(detailTask.created_at).toLocaleString() }}</span>
              </div>
            </div>
          </div>

          <!-- Section: 执行策略 -->
          <div style="background: #f8fafc; border-radius: 14px; padding: 20px; margin-bottom: 12px">
            <h3 style="font-size: 13px; font-weight: 600; color: #475569; margin: 0 0 16px 0">执行策略</h3>
            <div style="margin-bottom: 14px">
              <label style="display: block; font-size: 12px; color: #94a3b8; margin-bottom: 6px">分支策略</label>
              <span
                style="padding: 6px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; display: inline-block"
                :style="{
                  background: detailTask.branch_strategy.type === 'current_branch' ? '#ede9fe' : '#dbeafe',
                  color: detailTask.branch_strategy.type === 'current_branch' ? '#7c3aed' : '#2563eb'
                }"
              >
                {{ detailTask.branch_strategy.type === 'current_branch' ? '当前分支' : detailTask.branch_strategy.type === 'new_worktree' ? '新建 Worktree' : '已有分支' }}
              </span>
              <span v-if="detailTask.branch_strategy.type !== 'current_branch'" style="font-size: 13px; font-family: monospace; color: #0f172a; margin-left: 8px">{{ (detailTask.branch_strategy as { name: string }).name }}</span>
            </div>
            <div>
              <label style="display: block; font-size: 12px; color: #94a3b8; margin-bottom: 6px">目标</label>
              <span
                style="padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 500; display: inline-block; margin-right: 8px"
                :style="{
                  background: detailTask.target.type === 'objective' ? '#fef3c7' : '#d1fae5',
                  color: detailTask.target.type === 'objective' ? '#d97706' : '#059669'
                }"
              >
                {{ detailTask.target.type === 'objective' ? '目标描述' : 'Spec 文件' }}
              </span>
              <div style="margin-top: 8px; font-size: 13px; color: #334155; background: white; padding: 10px 14px; border-radius: 10px; line-height: 1.5; white-space: pre-wrap">
                {{ detailTask.target.type === 'objective' ? (detailTask.target as { text: string }).text : (detailTask.target as { path: string }).path }}
              </div>
            </div>
          </div>

          <!-- Section: 高级选项 -->
          <div style="background: #f8fafc; border-radius: 14px; padding: 20px; margin-bottom: 12px">
            <h3 style="font-size: 13px; font-weight: 600; color: #475569; margin: 0 0 16px 0">高级选项</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px 32px">
              <div>
                <label style="display: block; font-size: 12px; color: #94a3b8; margin-bottom: 4px">路由档位</label>
                <span style="font-size: 14px; font-weight: 500; color: #0f172a">{{ detailTask.tier || 'Auto' }}</span>
              </div>
              <div>
                <label style="display: block; font-size: 12px; color: #94a3b8; margin-bottom: 4px">最大迭代数</label>
                <span style="font-size: 14px; font-weight: 500; color: #0f172a">{{ detailTask.max_iterations ?? '默认 (50)' }}</span>
              </div>
              <div>
                <label style="display: block; font-size: 12px; color: #94a3b8; margin-bottom: 4px">预算上限</label>
                <span style="font-size: 14px; font-weight: 500; color: #0f172a">{{ detailTask.max_budget_usd != null ? `$${detailTask.max_budget_usd}` : '不限' }}</span>
              </div>
              <div>
                <label style="display: block; font-size: 12px; color: #94a3b8; margin-bottom: 4px">休眠抑制</label>
                <span style="font-size: 14px; font-weight: 500" :style="{ color: detailTask.sleep_inhibit ? '#059669' : '#dc2626' }">{{ detailTask.sleep_inhibit ? '开启' : '关闭' }}</span>
              </div>
            </div>
          </div>

          <!-- Section: 执行记录 -->
          <div v-if="detailTask.executions.length > 0" style="margin-bottom: 12px">
            <h3 style="font-size: 13px; font-weight: 600; color: #475569; margin: 0 0 12px">执行记录 ({{ detailTask.executions.length }})</h3>
            <div v-for="(exec, idx) in detailTask.executions" :key="idx" style="padding: 14px; border-radius: 12px; background: #f8fafc; margin-bottom: 8px; font-size: 13px">
              <div style="display: flex; justify-content: space-between">
                <span style="color: #64748b">Run {{ exec.run_id.slice(0, 8) }}</span>
                <span style="font-weight: 500; color: #1e293b">{{ exec.exit_code !== null ? `exit ${exec.exit_code}` : "running..." }}</span>
              </div>
              <div v-if="exec.iterations != null" style="margin-top: 4px; color: #64748b">{{ exec.iterations }} 次迭代</div>
            </div>
          </div>

          <div v-if="detailLog">
            <h3 style="font-size: 13px; font-weight: 600; color: #475569; margin: 0 0 12px">最近日志</h3>
            <pre style="background: #1e293b; border-radius: 12px; padding: 20px; color: white; font-family: monospace; font-size: 12px; overflow-x: auto; white-space: pre-wrap; max-height: 400px">{{ detailLog }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toast-enter-active { animation: toastIn 0.3s ease-out; }
.toast-leave-active { animation: toastOut 0.25s ease-in; }
@keyframes toastIn {
  from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes toastOut {
  from { opacity: 1; transform: translateX(-50%) translateY(0); }
  to   { opacity: 0; transform: translateX(-50%) translateY(-12px); }
}
</style>
