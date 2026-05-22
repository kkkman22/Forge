<script setup lang="ts">
import type { TaskStatus } from "../types/index";

defineProps<{
  current: TaskStatus | "all";
  counts: Record<string, number>;
}>();

const emit = defineEmits<{
  change: [status: TaskStatus | "all"];
}>();

type FilterTab = { key: TaskStatus | "all"; label: string };

const tabs: FilterTab[] = [
  { key: "all", label: "全部" },
  { key: "running", label: "执行中" },
  { key: "awaiting_review", label: "待审核" },
  { key: "completed", label: "已完成" },
  { key: "failed", label: "失败" },
];
</script>

<template>
  <div
    class="inline-flex gap-1.5 p-1.5 bg-[var(--color-card)] rounded-[var(--rounded-md)] shadow-[var(--shadow-sm)] border border-[var(--color-border)]"
    :style="{ fontFamily: 'var(--font-body)' }"
  >
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="px-5 py-2.5 rounded-[var(--rounded-sm)] text-[14px] font-medium transition-all duration-200"
      :class="
        current === tab.key
          ? 'bg-[var(--color-primary)] text-white shadow-[var(--shadow-xs)]'
          : 'text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-secondary)]'
      "
      @click="emit('change', tab.key)"
    >
      {{ tab.label }}
      <span
        v-if="counts[tab.key] && counts[tab.key] > 0"
        class="ml-2 text-[12px] px-2 py-0.5 rounded-[var(--rounded-pill)] font-semibold"
        :class="current === tab.key ? 'bg-white/20 text-white' : 'bg-[var(--color-surface-secondary)] text-[var(--color-ink-secondary)]'"
      >
        {{ counts[tab.key] }}
      </span>
    </button>
  </div>
</template>
