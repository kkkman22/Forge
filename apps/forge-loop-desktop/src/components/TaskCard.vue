<script setup lang="ts">
import type { Task, TaskStatus } from "../types/index";

const props = defineProps<{
  task: Task;
}>();

defineEmits<{
  start: [taskId: string];
  stop: [taskId: string];
  review: [taskId: string];
  retry: [taskId: string];
  edit: [taskId: string];
  delete: [taskId: string];
}>();

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  queued: { label: "排队中", color: "#86868b", bg: "#f5f5f7" },
  running: { label: "执行中", color: "#0066cc", bg: "#e8f0fe" },
  paused: { label: "已暂停", color: "#ff9500", bg: "#fff8e1" },
  awaiting_review: { label: "待审核", color: "#34c759", bg: "#e8f5e9" },
  completed: { label: "已通过", color: "#34c759", bg: "#e8f5e9" },
  failed: { label: "失败", color: "#ff3b30", bg: "#ffeaea" },
};

function getStatusConfig(status: TaskStatus) {
  return statusConfig[status] || statusConfig.queued;
}

const config = getStatusConfig(props.task.status);

const repoName = props.task.repo_path.split("/").pop() || props.task.repo_path;

const branchName = (() => {
  const bs = props.task.branch_strategy;
  if (bs.type === "current_branch") return "当前分支";
  if (bs.type === "new_worktree") return `🌳 ${bs.name}`;
  if (bs.type === "existing_branch") return `↗ ${bs.name}`;
  return "";
})();

const lastExec = props.task.executions[props.task.executions.length - 1];

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}
</script>

<template>
  <div
    :data-task-id="task.id"
    class="flex items-center gap-4 px-4 py-3 rounded-[var(--rounded-md)] transition-colors"
    :style="{ fontFamily: 'var(--font-body)' }"
    role="button"
    tabindex="0"
    @keydown.enter="task.status === 'awaiting_review' ? $emit('review', task.id) : $emit('edit', task.id)"
  >
    <!-- Status badge -->
    <span
      class="inline-flex items-center px-3 py-1 rounded-[var(--rounded-pill)] text-[13px] font-medium whitespace-nowrap"
      :style="{ color: config.color, backgroundColor: config.bg }"
    >
      {{ config.label }}
    </span>

    <!-- Main content -->
    <div class="flex-1 min-w-0">
      <div class="text-[17px] font-medium text-[var(--color-ink)] truncate">
        {{ task.title }}
      </div>
      <div class="flex gap-3 mt-1 text-[14px] text-[var(--color-ink-muted)]">
        <span>{{ repoName }}</span>
        <span>{{ branchName }}</span>
        <span v-if="lastExec?.iterations != null">{{ lastExec.iterations }} 次迭代</span>
        <span v-if="task.status === 'completed' && lastExec?.ended_at">
          {{ formatTime(lastExec.ended_at) }}
        </span>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2 shrink-0">
      <button
        v-if="task.status === 'queued'"
        class="px-4 py-2 rounded-[var(--rounded-pill)] text-[15px] bg-[var(--color-primary)] text-white font-medium active:scale-[0.97] transition-transform"
        @click.stop="$emit('start', task.id)"
      >
        启动
      </button>
      <button
        v-if="task.status === 'running'"
        class="px-4 py-2 rounded-[var(--rounded-pill)] text-[15px] bg-[var(--color-error)] text-white font-medium active:scale-[0.97] transition-transform"
        @click.stop="$emit('stop', task.id)"
      >
        停止
      </button>
      <button
        v-if="task.status === 'awaiting_review'"
        class="px-4 py-2 rounded-[var(--rounded-pill)] text-[15px] bg-[var(--color-primary)] text-white font-medium active:scale-[0.97] transition-transform"
        @click.stop="$emit('review', task.id)"
      >
        审核
      </button>
      <button
        v-if="task.status === 'failed'"
        class="px-4 py-2 rounded-[var(--rounded-pill)] text-[15px] bg-[var(--color-primary)] text-white font-medium active:scale-[0.97] transition-transform"
        @click.stop="$emit('retry', task.id)"
      >
        重试
      </button>
      <button
        v-if="['queued', 'paused', 'failed'].includes(task.status)"
        class="p-2 text-[var(--color-ink-muted)] hover:text-[var(--color-error)] transition-colors"
        title="删除"
        @click.stop="$emit('delete', task.id)"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </div>
</template>
