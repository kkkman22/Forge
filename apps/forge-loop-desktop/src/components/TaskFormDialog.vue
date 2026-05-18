<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { Task, TaskInput, BranchStrategy, TaskTarget } from "../types/index";

const props = defineProps<{
  task: Task | null;
}>();

const emit = defineEmits<{
  submit: [input: TaskInput];
  cancel: [];
}>();

const title = ref(props.task?.title || "");
const repoPath = ref(props.task?.repo_path || "");
const branchStrategyType = ref<BranchStrategy["type"]>(
  props.task?.branch_strategy.type || "current_branch"
);
const branchName = ref(
  props.task?.branch_strategy.type === "new_worktree"
    ? props.task.branch_strategy.name
    : props.task?.branch_strategy.type === "existing_branch"
      ? props.task.branch_strategy.name
      : ""
);
const targetType = ref<TaskTarget["type"]>(
  props.task?.target.type || "objective"
);
const objectiveText = ref(
  props.task?.target.type === "objective" ? props.task.target.text : ""
);
const specPath = ref(
  props.task?.target.type === "spec_file" ? props.task.target.path : ""
);
const tier = ref(props.task?.tier || "auto");
const maxIterations = ref(props.task?.max_iterations ?? 50);
const maxBudgetUsd = ref(props.task?.max_budget_usd ?? null);
const sleepInhibit = ref(props.task?.sleep_inhibit ?? true);

const recentRepos = ref<string[]>([]);

const errors = computed(() => {
  const e: Record<string, string> = {};
  if (!title.value.trim()) e.title = "任务标题不能为空";
  else if (title.value.length > 80) e.title = "标题不能超过 80 字符";
  if (!repoPath.value.trim()) e.repoPath = "请选择目标仓库";
  if (
    (branchStrategyType.value === "new_worktree" ||
      branchStrategyType.value === "existing_branch") &&
    !branchName.value.trim()
  ) {
    e.branchName = "请输入分支名称";
  }
  if (targetType.value === "objective" && !objectiveText.value.trim())
    e.objective = "请输入目标描述";
  if (targetType.value === "spec_file" && !specPath.value.trim())
    e.specPath = "请输入 spec 文件路径";
  return e;
});

const isValid = computed(() => Object.keys(errors.value).length === 0);

function buildInput(): TaskInput {
  let branchStrategy: BranchStrategy;
  if (branchStrategyType.value === "new_worktree") {
    branchStrategy = { type: "new_worktree", name: branchName.value };
  } else if (branchStrategyType.value === "existing_branch") {
    branchStrategy = { type: "existing_branch", name: branchName.value };
  } else {
    branchStrategy = { type: "current_branch" };
  }

  let target: TaskTarget;
  if (targetType.value === "spec_file") {
    target = { type: "spec_file", path: specPath.value };
  } else {
    target = { type: "objective", text: objectiveText.value };
  }

  return {
    title: title.value,
    repo_path: repoPath.value,
    branch_strategy: branchStrategy,
    target,
    tier: tier.value === "auto" ? undefined : tier.value,
    max_iterations: maxIterations.value === 50 ? undefined : maxIterations.value,
    max_budget_usd: maxBudgetUsd.value ?? undefined,
    sleep_inhibit: sleepInhibit.value,
  };
}

async function handleBrowse() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择目标仓库",
  });
  if (selected) {
    repoPath.value = selected;
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    emit("cancel");
  }
}

onMounted(async () => {
  try {
    recentRepos.value = await invoke<string[]>("get_recent_repos");
  } catch {
    // Ignore
  }
});
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
    @keydown="handleKeydown"
  >
    <div
      class="bg-white rounded-[var(--rounded-lg)] w-[90%] max-w-[560px] max-h-[85vh] overflow-y-auto shadow-2xl"
      :style="{ fontFamily: 'var(--font-body)' }"
    >
      <!-- Header -->
      <div class="px-6 pt-6 pb-4">
        <h2
          class="text-[24px] font-semibold tracking-[-0.28px]"
          :style="{ fontFamily: 'var(--font-display)' }"
        >
          {{ task ? "编辑任务" : "新建任务" }}
        </h2>
      </div>

      <!-- Form -->
      <div class="px-6 space-y-5 pb-6">
        <!-- Title -->
        <div>
          <label class="block text-[14px] font-medium text-[var(--color-ink-muted)] mb-1.5">
            任务标题 <span class="text-[var(--color-error)]">*</span>
          </label>
          <input
            v-model="title"
            type="text"
            maxlength="80"
            class="w-full px-3 py-2.5 border rounded-[var(--rounded-sm)] text-[17px] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            :class="errors.title ? 'border-[var(--color-error)]' : 'border-[var(--color-hairline)]'"
            placeholder="描述任务目标..."
          />
          <p v-if="errors.title" class="mt-1 text-[13px] text-[var(--color-error)]">
            {{ errors.title }}
          </p>
        </div>

        <!-- Repo path -->
        <div>
          <label class="block text-[14px] font-medium text-[var(--color-ink-muted)] mb-1.5">
            目标仓库 <span class="text-[var(--color-error)]">*</span>
          </label>
          <div class="flex gap-2">
            <input
              v-model="repoPath"
              type="text"
              class="flex-1 px-3 py-2.5 border rounded-[var(--rounded-sm)] text-[17px] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              :class="errors.repoPath ? 'border-[var(--color-error)]' : 'border-[var(--color-hairline)]'"
              placeholder="/path/to/repo"
            />
            <button
              class="px-4 py-2.5 border border-[var(--color-hairline)] rounded-[var(--rounded-sm)] text-[15px] text-[var(--color-ink)] hover:bg-[var(--color-surface-secondary)] transition-colors"
              @click="handleBrowse"
            >
              浏览
            </button>
          </div>
          <div v-if="recentRepos.length > 0" class="mt-1.5 flex flex-wrap gap-1">
            <button
              v-for="repo in recentRepos"
              :key="repo"
              class="px-2 py-0.5 text-[12px] rounded bg-[var(--color-surface-secondary)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
              @click="repoPath = repo"
            >
              {{ repo.split("/").pop() }}
            </button>
          </div>
          <p v-if="errors.repoPath" class="mt-1 text-[13px] text-[var(--color-error)]">
            {{ errors.repoPath }}
          </p>
        </div>

        <!-- Branch strategy -->
        <div>
          <label class="block text-[14px] font-medium text-[var(--color-ink-muted)] mb-1.5">
            执行分支策略
          </label>
          <div class="flex gap-2">
            <button
              v-for="opt in (['current_branch', 'new_worktree', 'existing_branch'] as const)"
              :key="opt"
              class="px-4 py-2 rounded-[var(--rounded-sm)] text-[15px] border transition-colors"
              :class="branchStrategyType === opt
                ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[#e8f0fe]'
                : 'border-[var(--color-hairline)] text-[var(--color-ink)] hover:border-[var(--color-primary)]'"
              @click="branchStrategyType = opt"
            >
              {{ opt === 'current_branch' ? '当前分支' : opt === 'new_worktree' ? '新建 Worktree' : '已有分支' }}
            </button>
          </div>
          <input
            v-if="branchStrategyType !== 'current_branch'"
            v-model="branchName"
            type="text"
            class="mt-2 w-full px-3 py-2.5 border rounded-[var(--rounded-sm)] text-[17px] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            :class="errors.branchName ? 'border-[var(--color-error)]' : 'border-[var(--color-hairline)]'"
            :placeholder="branchStrategyType === 'new_worktree' ? 'worktree 名称...' : '分支名称...'"
          />
        </div>

        <!-- Target type -->
        <div>
          <label class="block text-[14px] font-medium text-[var(--color-ink-muted)] mb-1.5">
            目标输入方式
          </label>
          <div class="flex gap-2 mb-2">
            <button
              v-for="opt in (['objective', 'spec_file'] as const)"
              :key="opt"
              class="px-4 py-2 rounded-[var(--rounded-sm)] text-[15px] border transition-colors"
              :class="targetType === opt
                ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[#e8f0fe]'
                : 'border-[var(--color-hairline)] text-[var(--color-ink)] hover:border-[var(--color-primary)]'"
              @click="targetType = opt"
            >
              {{ opt === 'objective' ? '目标描述' : 'Spec 文件' }}
            </button>
          </div>
          <textarea
            v-if="targetType === 'objective'"
            v-model="objectiveText"
            rows="3"
            class="w-full px-3 py-2.5 border rounded-[var(--rounded-sm)] text-[17px] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            :class="errors.objective ? 'border-[var(--color-error)]' : 'border-[var(--color-hairline)]'"
            placeholder="描述任务目标..."
          />
          <input
            v-else
            v-model="specPath"
            type="text"
            class="w-full px-3 py-2.5 border rounded-[var(--rounded-sm)] text-[17px] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            :class="errors.specPath ? 'border-[var(--color-error)]' : 'border-[var(--color-hairline)]'"
            placeholder=".kiro/specs/my-feature/spec.md"
          />
        </div>

        <!-- Advanced options -->
        <details class="group">
          <summary class="text-[14px] font-medium text-[var(--color-ink-muted)] cursor-pointer hover:text-[var(--color-ink)]">
            高级选项
          </summary>
          <div class="mt-3 space-y-4 pl-1">
            <!-- Tier -->
            <div class="flex items-center justify-between">
              <label class="text-[15px]">路由档位</label>
              <select
                v-model="tier"
                class="px-3 py-1.5 border border-[var(--color-hairline)] rounded-[var(--rounded-sm)] text-[15px] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="auto">Auto</option>
                <option value="light">Light</option>
                <option value="standard">Standard</option>
                <option value="full">Full</option>
              </select>
            </div>

            <!-- Max iterations -->
            <div class="flex items-center justify-between">
              <label class="text-[15px]">最大迭代数</label>
              <input
                v-model.number="maxIterations"
                type="number"
                min="1"
                max="200"
                class="w-24 px-3 py-1.5 border border-[var(--color-hairline)] rounded-[var(--rounded-sm)] text-[15px] text-right focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <!-- Max budget -->
            <div class="flex items-center justify-between">
              <label class="text-[15px]">预算上限 (USD)</label>
              <input
                v-model.number="maxBudgetUsd"
                type="number"
                min="0"
                step="0.01"
                placeholder="无限制"
                class="w-28 px-3 py-1.5 border border-[var(--color-hairline)] rounded-[var(--rounded-sm)] text-[15px] text-right focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
            </div>

            <!-- Sleep inhibit -->
            <div class="flex items-center justify-between">
              <label class="text-[15px]">休眠抑制</label>
              <button
                class="relative w-12 h-7 rounded-full transition-colors"
                :class="sleepInhibit ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-hairline)]'"
                @click="sleepInhibit = !sleepInhibit"
              >
                <span
                  class="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform"
                  :class="sleepInhibit ? 'left-[22px]' : 'left-0.5'"
                />
              </button>
            </div>
          </div>
        </details>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-[var(--color-hairline)] flex justify-end gap-3">
        <button
          class="px-5 py-2.5 text-[15px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
          @click="emit('cancel')"
        >
          取消
        </button>
        <button
          class="px-6 py-2.5 rounded-[var(--rounded-pill)] text-[15px] bg-[var(--color-primary)] text-white font-medium active:scale-[0.97] transition-transform disabled:opacity-40"
          :disabled="!isValid"
          @click="emit('submit', buildInput())"
        >
          {{ task ? "保存" : "创建" }}
        </button>
      </div>
    </div>
  </div>
</template>
