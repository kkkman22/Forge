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
    class="flex gap-1 px-2 py-1 bg-[var(--color-surface-secondary)] rounded-[var(--rounded-pill)]"
    :style="{ fontFamily: 'var(--font-body)' }"
  >
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="px-4 py-1.5 rounded-[var(--rounded-pill)] text-[14px] font-medium transition-all"
      :class="
        current === tab.key
          ? 'bg-white text-[var(--color-ink)] shadow-sm'
          : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
      "
      @click="emit('change', tab.key)"
    >
      {{ tab.label }}
      <span
        v-if="counts[tab.key] && counts[tab.key] > 0"
        class="ml-1 text-[12px] opacity-60"
      >
        {{ counts[tab.key] }}
      </span>
    </button>
  </div>
</template>
