<script setup lang="ts">
import { ref, computed } from "vue";
import type { Task } from "../types/index";

const props = defineProps<{
  task: Task;
  diffContent: string;
  reviewReport: string;
}>();

const emit = defineEmits<{
  approve: [taskId: string];
  reject: [taskId: string, feedback: string];
  close: [];
}>();

const activeTab = ref<"overview" | "diff" | "review">("overview");
const feedbackText = ref("");
const showRejectDialog = ref(false);

const duration = computed(() => {
  const task = props.task;
  const latestExec = task.executions[task.executions.length - 1];
  if (!latestExec) return "N/A";
  const start = new Date(latestExec.started_at).getTime();
  const end = latestExec.ended_at
    ? new Date(latestExec.ended_at).getTime()
    : Date.now();
  const mins = Math.round((end - start) / 60000);
  return `${mins}m`;
});

const iterations = computed(() => {
  const latestExec = props.task.executions[props.task.executions.length - 1];
  return latestExec?.iterations ?? "N/A";
});

function handleApprove() {
  emit("approve", props.task.id);
}

function handleReject() {
  showRejectDialog.value = true;
}

function submitReject() {
  if (feedbackText.value.trim()) {
    emit("reject", props.task.id, feedbackText.value.trim());
    showRejectDialog.value = false;
    feedbackText.value = "";
  }
}

function closeRejectDialog() {
  showRejectDialog.value = false;
}

function handleKeydown(e: KeyboardEvent) {
  if (e.metaKey && e.key === "Enter") {
    e.preventDefault();
    handleApprove();
  } else if (e.metaKey && e.key === "Backspace") {
    e.preventDefault();
    handleReject();
  } else if (e.key === "Escape") {
    if (showRejectDialog.value) closeRejectDialog();
  }
}
</script>

<template>
  <div style="position: fixed; inset: 0; z-index: 50; display: flex" @keydown="handleKeydown">
    <!-- Left overlay -->
    <div style="width: 40%; background: rgba(0,0,0,0.2); backdrop-filter: blur(4px)" @click="$emit('close')" />
    <!-- Right panel -->
    <div style="width: 60%; background: white; display: flex; flex-direction: column; box-shadow: -8px 0 30px rgba(0,0,0,0.08); border-radius: 20px 0 0 20px; font-family: var(--font-body)">

      <!-- Header with tabs -->
      <div style="padding: 24px 28px 0; flex-shrink: 0">
        <!-- Close button row -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px">
          <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0; font-family: var(--font-display)">审核任务</h2>
          <button style="width: 32px; height: 32px; border-radius: 50%; background: #f1f5f9; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #64748b" @click="$emit('close')">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
        </div>
        <!-- Tab switcher (pill style) -->
        <div style="display: flex; gap: 4px; background: #f1f5f9; border-radius: 12px; padding: 4px; width: fit-content; margin-bottom: 20px">
          <button
            v-for="tab in (['overview', 'diff', 'review'] as const)"
            :key="tab"
            :style="{
              padding: '8px 20px',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: activeTab === tab ? 'white' : 'transparent',
              color: activeTab === tab ? '#0f172a' : '#94a3b8',
              boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
            }"
            @click="activeTab = tab"
          >
            {{ tab === "overview" ? "概览" : tab === "diff" ? "代码变更" : "Review 报告" }}
          </button>
        </div>
      </div>

      <!-- Tab content -->
      <div style="flex: 1; overflow-y: auto; padding: 0 28px 28px">
        <!-- Overview -->
        <div v-if="activeTab === 'overview'" style="display: flex; flex-direction: column; gap: 16px">
          <h3 style="font-size: 18px; font-weight: 600; color: #0f172a; margin: 0">{{ task.title }}</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px">
            <div style="padding: 20px; border-radius: 14px; background: #dbeafe">
              <span style="font-size: 12px; color: #2563eb; display: block; margin-bottom: 6px; font-weight: 500">迭代数</span>
              <span style="font-size: 24px; font-weight: 700; color: #0f172a">{{ iterations }}</span>
            </div>
            <div style="padding: 20px; border-radius: 14px; background: #ede9fe">
              <span style="font-size: 12px; color: #7c3aed; display: block; margin-bottom: 6px; font-weight: 500">运行时长</span>
              <span style="font-size: 24px; font-weight: 700; color: #0f172a">{{ duration }}</span>
            </div>
          </div>
        </div>

        <!-- Diff -->
        <div
          v-if="activeTab === 'diff'"
          style="background: #1e293b; border-radius: 14px; padding: 20px; color: white; font-family: monospace; font-size: 13px; overflow-x: auto; white-space: pre-wrap"
        >
          {{ diffContent || "No diff available" }}
        </div>

        <!-- Review report -->
        <div
          v-if="activeTab === 'review'"
          style="font-size: 15px; color: #334155; line-height: 1.6"
        >
          {{ reviewReport || "No review report available" }}
        </div>
      </div>

      <!-- Action bar -->
      <div style="padding: 16px 28px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 12px; flex-shrink: 0">
        <button
          style="padding: 12px 28px; border-radius: 14px; font-size: 14px; font-weight: 600; color: white; background: #ef4444; border: none; cursor: pointer; transition: all 0.15s"
          @click="handleReject"
          @mouseenter="($event.currentTarget as HTMLElement).style.opacity = '0.9'"
          @mouseleave="($event.currentTarget as HTMLElement).style.opacity = '1'"
        >
          打回
        </button>
        <button
          style="padding: 12px 28px; border-radius: 14px; font-size: 14px; font-weight: 600; color: white; background: #4f46e5; border: none; cursor: pointer; box-shadow: 0 4px 12px rgba(79,70,229,0.3); transition: all 0.15s"
          @click="handleApprove"
          @mouseenter="($event.currentTarget as HTMLElement).style.opacity = '0.9'"
          @mouseleave="($event.currentTarget as HTMLElement).style.opacity = '1'"
        >
          通过
        </button>
      </div>

      <!-- Reject dialog -->
      <div
        v-if="showRejectDialog"
        style="position: absolute; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 10"
      >
        <div style="background: white; border-radius: 20px; padding: 28px; width: 80%; max-width: 420px; box-shadow: 0 25px 60px rgba(0,0,0,0.15)">
          <h3 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 20px; font-family: var(--font-display)">
            打回反馈
          </h3>
          <textarea
            v-model="feedbackText"
            style="width: 100%; height: 128px; padding: 14px 16px; border-radius: 12px; font-size: 14px; border: 1.5px solid #e2e8f0; background: white; outline: none; resize: none; color: #0f172a; box-sizing: border-box; font-family: inherit; transition: border-color 0.2s"
            placeholder="请描述需要修改的内容..."
            @focus="($event.currentTarget as HTMLElement).style.borderColor = '#4f46e5'"
            @blur="($event.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'"
          />
          <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px">
            <button
              style="padding: 10px 20px; border-radius: 12px; font-size: 14px; color: #94a3b8; font-weight: 500; background: none; border: none; cursor: pointer"
              @click="closeRejectDialog"
            >
              取消
            </button>
            <button
              :style="{
                padding: '10px 24px',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: 600,
                border: 'none',
                cursor: feedbackText.trim() ? 'pointer' : 'not-allowed',
                color: 'white',
                background: feedbackText.trim() ? '#ef4444' : '#fca5a5',
                transition: 'all 0.15s'
              }"
              :disabled="!feedbackText.trim()"
              @click="submitReject"
            >
              提交打回
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
