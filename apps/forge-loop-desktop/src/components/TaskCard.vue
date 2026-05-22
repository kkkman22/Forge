<script setup lang="ts">
import type { Task } from "../types/index";
import { statusType } from "../types/index";

const props = defineProps<{
  task: Task;
}>();

defineEmits<{
  start: [taskId: string];
  stop: [taskId: string];
  review: [taskId: string];
  retry: [taskId: string];
  restart: [taskId: string];
  edit: [taskId: string];
  delete: [taskId: string];
  detail: [taskId: string];
}>();

const statusMeta: Record<string, { label: string; color: string; bg: string }> = {
  queued:          { label: "排队中", color: "#64748b", bg: "#f1f5f9" },
  running:         { label: "执行中", color: "#4f46e5", bg: "#eef2ff" },
  paused:          { label: "已暂停", color: "#d97706", bg: "#fffbeb" },
  awaiting_review: { label: "待审核", color: "#059669", bg: "#ecfdf5" },
  completed:       { label: "已通过", color: "#059669", bg: "#ecfdf5" },
  failed:          { label: "失败",   color: "#dc2626", bg: "#fef2f2" },
};

function getStatus(status: ReturnType<typeof statusType>) {
  return statusMeta[status] || statusMeta.queued;
}

const meta = getStatus(statusType(props.task.status));
const repoName = props.task.repo_path.split("/").pop() || props.task.repo_path;
const lastExec = props.task.executions[props.task.executions.length - 1];

const maxIter = props.task.max_iterations || 50;
const liveIter = (props.task.metadata as Record<string, unknown>)?._liveIteration as number | null;
const curIter = liveIter ?? lastExec?.iterations ?? 0;
const liveSummary = (props.task.metadata as Record<string, unknown>)?._liveSummary as string | null;
const pct = Math.min(Math.round((curIter / maxIter) * 100), 100);
const circumference = 2 * Math.PI * 16;
const dashoffset = circumference - (pct / 100) * circumference;

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}
</script>

<template>
  <div
    :data-task-id="task.id"
    style="display: flex; align-items: center; gap: 16px; padding: 16px 20px; background: white; border-radius: 16px; border: 1px solid #f1f5f9; cursor: pointer; transition: all 0.15s"
    @mouseenter="($event.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'; ($event.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'"
    @mouseleave="($event.currentTarget as HTMLElement).style.boxShadow = 'none'; ($event.currentTarget as HTMLElement).style.borderColor = '#f1f5f9'"
    role="button"
    tabindex="0"
    @keydown.enter="statusType(task.status) === 'awaiting_review' ? $emit('review', task.id) : $emit('detail', task.id)"
    @click="$emit('detail', task.id)"
  >
    <!-- Left: status indicator -->
    <div style="flex-shrink: 0; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center">
      <!-- Running: progress ring -->
      <div v-if="statusType(task.status) === 'running'" style="position: relative; width: 40px; height: 40px">
        <svg width="40" height="40" viewBox="0 0 40 40" style="transform: rotate(-90deg)">
          <circle cx="20" cy="20" r="16" fill="none" stroke="#e2e8f0" stroke-width="3" />
          <circle cx="20" cy="20" r="16" fill="none" stroke="#4f46e5" stroke-width="3" stroke-linecap="round" :stroke-dasharray="circumference" :stroke-dashoffset="dashoffset" style="transition: stroke-dashoffset 0.5s" />
        </svg>
        <span style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: #4f46e5">{{ pct }}%</span>
      </div>
      <!-- Completed: checkmark circle -->
      <div v-else-if="statusType(task.status) === 'completed'" style="width: 28px; height: 28px; border-radius: 50%; background: #059669; display: flex; align-items: center; justify-content: center">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7l3 3 5-5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <!-- Failed: x circle -->
      <div v-else-if="statusType(task.status) === 'failed'" style="width: 28px; height: 28px; border-radius: 50%; background: #fef2f2; display: flex; align-items: center; justify-content: center">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/></svg>
      </div>
      <!-- Others: hollow circle -->
      <div v-else style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid #cbd5e1"></div>
    </div>

    <!-- Middle: task info -->
    <div style="flex: 1; min-width: 0">
      <div style="display: flex; align-items: center; gap: 10px">
        <span style="font-size: 15px; font-weight: 500; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
          {{ task.title }}
        </span>
        <span
          style="font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; white-space: nowrap; flex-shrink: 0"
          :style="{ color: meta.color, background: meta.bg }"
        >
          {{ meta.label }}
        </span>
      </div>
      <div style="display: flex; align-items: center; gap: 12px; margin-top: 4px; font-size: 13px; color: #94a3b8">
        <span>{{ repoName }}</span>
        <span v-if="curIter > 0">{{ curIter }} 次迭代</span>
        <span v-if="statusType(task.status) === 'completed' && lastExec?.ended_at">{{ fmtTime(lastExec.ended_at) }}</span>
      </div>
      <div v-if="liveSummary && statusType(task.status) === 'running'" style="margin-top: 6px; font-size: 12px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
        {{ liveSummary }}
      </div>
    </div>

    <!-- Right: action buttons -->
    <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0">
      <button
        v-if="statusType(task.status) === 'queued'"
        style="padding: 8px 20px; border-radius: 10px; font-size: 13px; font-weight: 600; color: white; background: #4f46e5; border: none; cursor: pointer"
        @click.stop="$emit('start', task.id)"
      >启动</button>
      <button
        v-if="statusType(task.status) === 'paused'"
        style="padding: 8px 20px; border-radius: 10px; font-size: 13px; font-weight: 600; color: white; background: #4f46e5; border: none; cursor: pointer"
        @click.stop="$emit('start', task.id)"
      >恢复</button>
      <button
        v-if="statusType(task.status) === 'running'"
        style="padding: 8px 20px; border-radius: 10px; font-size: 13px; font-weight: 600; color: white; background: #dc2626; border: none; cursor: pointer"
        @click.stop="$emit('stop', task.id)"
      >停止</button>
      <button
        v-if="statusType(task.status) === 'awaiting_review'"
        style="padding: 8px 20px; border-radius: 10px; font-size: 13px; font-weight: 600; color: white; background: #4f46e5; border: none; cursor: pointer"
        @click.stop="$emit('review', task.id)"
      >审核</button>
      <button
        v-if="statusType(task.status) === 'failed' && task.executions.some(e => e.branch_name)"
        style="padding: 8px 20px; border-radius: 10px; font-size: 13px; font-weight: 600; color: white; background: #4f46e5; border: none; cursor: pointer"
        @click.stop="$emit('retry', task.id)"
      >继续</button>
      <button
        v-if="statusType(task.status) === 'failed' && task.executions.some(e => e.branch_name)"
        style="padding: 8px 14px; border-radius: 10px; font-size: 12px; font-weight: 500; color: #64748b; background: #f1f5f9; border: none; cursor: pointer"
        @click.stop="$emit('restart', task.id)"
      >从头开始</button>
      <button
        v-if="statusType(task.status) === 'failed' && !task.executions.some(e => e.branch_name)"
        style="padding: 8px 20px; border-radius: 10px; font-size: 13px; font-weight: 600; color: white; background: #4f46e5; border: none; cursor: pointer"
        @click.stop="$emit('retry', task.id)"
      >重试</button>
      <!-- Delete button: visible for queued, paused, failed, and completed -->
      <button
        v-if="['queued', 'paused', 'failed', 'completed'].includes(statusType(task.status))"
        style="width: 32px; height: 32px; border-radius: 8px; border: none; cursor: pointer; background: transparent; color: #94a3b8; display: flex; align-items: center; justify-content: center"
        title="删除"
        @click.stop="$emit('delete', task.id)"
        @mouseenter="($event.currentTarget as HTMLElement).style.background = '#fef2f2'; ($event.currentTarget as HTMLElement).style.color = '#dc2626'"
        @mouseleave="($event.currentTarget as HTMLElement).style.background = 'transparent'; ($event.currentTarget as HTMLElement).style.color = '#94a3b8'"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V2.5h4V4M4 4v8a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 6.5v4M8 6.5v4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>
      </button>
    </div>
  </div>
</template>
