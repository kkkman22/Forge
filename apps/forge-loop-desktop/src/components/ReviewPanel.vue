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
    closeRejectDialog();
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex" @keydown="handleKeydown">
    <div class="w-[40%] bg-black/20" @click="$emit('approve', '')" />
    <div
      class="w-[60%] bg-white flex flex-col shadow-2xl"
      :style="{ fontFamily: 'var(--font-body)' }"
    >
      <!-- Tab bar -->
      <div class="flex border-b border-[var(--color-hairline)]">
        <button
          v-for="tab in (['overview', 'diff', 'review'] as const)"
          :key="tab"
          class="px-6 py-3 text-[17px] relative transition-colors"
          :class="
            activeTab === tab
              ? 'text-[var(--color-primary)] font-semibold'
              : 'text-[var(--color-ink-muted)]'
          "
          @click="activeTab = tab"
        >
          {{ tab === "overview" ? "概览" : tab === "diff" ? "代码变更" : "Review 报告" }}
          <span
            v-if="activeTab === tab"
            class="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--color-primary)]"
          />
        </button>
      </div>

      <!-- Tab content -->
      <div class="flex-1 overflow-y-auto p-6">
        <!-- Overview -->
        <div v-if="activeTab === 'overview'" class="space-y-4">
          <h2
            class="text-[24px] font-semibold tracking-[-0.28px]"
            :style="{ fontFamily: 'var(--font-display)' }"
          >
            {{ task.title }}
          </h2>
          <div class="grid grid-cols-2 gap-4 text-[17px]">
            <div>
              <span class="text-[var(--color-ink-muted)]">迭代数</span>
              <span class="ml-2 font-semibold">{{ iterations }}</span>
            </div>
            <div>
              <span class="text-[var(--color-ink-muted)]">运行时长</span>
              <span class="ml-2 font-semibold">{{ duration }}</span>
            </div>
          </div>
        </div>

        <!-- Diff -->
        <div
          v-if="activeTab === 'diff'"
          class="bg-[var(--color-surface-dark)] rounded-[var(--rounded-md)] p-4 text-white font-mono text-[14px] overflow-x-auto whitespace-pre-wrap"
        >
          {{ diffContent || "No diff available" }}
        </div>

        <!-- Review report -->
        <div
          v-if="activeTab === 'review'"
          class="prose max-w-none text-[17px]"
        >
          {{ reviewReport || "No review report available" }}
        </div>
      </div>

      <!-- Action bar -->
      <div
        class="px-6 py-4 border-t border-[var(--color-hairline)] flex justify-end gap-3"
        style="backdrop-filter: saturate(180%) blur(20px)"
      >
        <button
          class="px-6 py-3 rounded-[var(--rounded-pill)] text-[17px] bg-[var(--color-error)] text-white font-medium active:scale-[0.97] transition-transform"
          @click="handleReject"
        >
          打回
        </button>
        <button
          class="px-6 py-3 rounded-[var(--rounded-pill)] text-[17px] bg-[var(--color-primary)] text-white font-medium active:scale-[0.97] transition-transform"
          @click="handleApprove"
        >
          通过
        </button>
      </div>

      <!-- Reject dialog -->
      <div
        v-if="showRejectDialog"
        class="absolute inset-0 bg-black/40 flex items-center justify-center z-10"
      >
        <div class="bg-white rounded-[var(--rounded-lg)] p-6 w-[80%] max-w-md">
          <h3 class="text-[21px] font-semibold mb-4" :style="{ fontFamily: 'var(--font-display)' }">
            打回反馈
          </h3>
          <textarea
            v-model="feedbackText"
            class="w-full h-32 p-3 border border-[var(--color-hairline)] rounded-[var(--rounded-sm)] text-[17px] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            placeholder="请描述需要修改的内容..."
          />
          <div class="flex justify-end gap-3 mt-4">
            <button
              class="px-4 py-2 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              @click="closeRejectDialog"
            >
              取消
            </button>
            <button
              class="px-6 py-2 rounded-[var(--rounded-pill)] bg-[var(--color-error)] text-white font-medium active:scale-[0.97] transition-transform disabled:opacity-50"
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
