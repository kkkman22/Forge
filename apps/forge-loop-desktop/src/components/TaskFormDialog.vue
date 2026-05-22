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
    repoPath: repoPath.value,
    branchStrategy,
    target,
    tier: tier.value === "auto" ? undefined : tier.value,
    maxIterations: maxIterations.value === 50 ? undefined : maxIterations.value,
    maxBudgetUsd: maxBudgetUsd.value ?? undefined,
    sleepInhibit: sleepInhibit.value,
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

function handleDrop(e: DragEvent) {
  e.preventDefault();
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    const file = files[0];
    const path = (file as unknown as { path?: string }).path;
    if (path) {
      repoPath.value = path;
    }
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault();
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
  <!-- Overlay -->
  <div
    style="position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px)"
    @keydown="handleKeydown"
  >
    <!-- Dialog -->
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
            <h2 style="font-size: 20px; font-weight: 700; color: #0f172a; font-family: var(--font-display); margin: 0">
              {{ task ? "编辑任务" : "新建任务" }}
            </h2>
            <p style="font-size: 14px; color: #94a3b8; margin-top: 4px">填写信息来创建自动化任务</p>
          </div>
          <button
            style="width: 36px; height: 36px; border-radius: 50%; background: #f1f5f9; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #94a3b8; flex-shrink: 0"
            @click="emit('cancel')"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>

      <!-- Scrollable sections -->
      <div style="flex: 1; overflow-y: auto; min-height: 0; padding: 12px 24px 20px">

        <!-- Section: 基本信息 -->
        <div style="background: #f8fafc; border-radius: 14px; padding: 20px; margin-bottom: 12px">
          <h3 style="font-size: 13px; font-weight: 600; color: #475569; margin: 0 0 20px 0">基本信息</h3>

          <!-- Title -->
          <div style="margin-bottom: 20px">
            <label style="display: block; font-size: 13px; color: #64748b; margin-bottom: 8px">
              任务标题 <span style="color: #f87171">*</span>
            </label>
            <input
              v-model="title"
              type="text"
              maxlength="80"
              :style="{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                fontSize: '14px',
                border: errors.title ? '1.5px solid #fca5a5' : '1.5px solid #e2e8f0',
                background: errors.title ? '#fff5f5' : 'white',
                outline: 'none',
                color: '#0f172a',
                boxSizing: 'border-box'
              }"
              placeholder="为这个任务起个名字"
            />
            <p v-if="errors.title" style="font-size: 12px; color: #f87171; margin: 6px 0 0">{{ errors.title }}</p>
          </div>

          <!-- Repo path -->
          <div>
            <label style="display: block; font-size: 13px; color: #64748b; margin-bottom: 8px">
              目标仓库 <span style="color: #f87171">*</span>
            </label>
            <div style="display: flex; gap: 8px" @drop="handleDrop" @dragover="handleDragOver">
              <input
                v-model="repoPath"
                type="text"
                :style="{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '12px',
                  fontSize: '14px',
                  border: errors.repoPath ? '1.5px solid #fca5a5' : '1.5px solid #e2e8f0',
                  background: errors.repoPath ? '#fff5f5' : 'white',
                  outline: 'none',
                  color: '#0f172a',
                  boxSizing: 'border-box',
                  minWidth: 0
                }"
                placeholder="/path/to/repo"
              />
              <button
                style="padding: '12px 16px'; borderRadius: 12px; fontSize: 13px; background: white; border: 1.5px solid #e2e8f0; color: #64748b; fontWeight: 500; cursor: pointer; flex-shrink: 0; white-space: nowrap; padding: 12px 16px"
                @click="handleBrowse"
              >
                浏览
              </button>
            </div>
            <div v-if="recentRepos.length > 0" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px">
              <button
                v-for="repo in recentRepos"
                :key="repo"
                style="padding: 4px 12px; font-size: 12px; border-radius: 8px; background: #ede9fe; color: #7c3aed; fontWeight: 500; border: none; cursor: pointer"
                @click="repoPath = repo"
              >
                {{ repo.split("/").pop() }}
              </button>
            </div>
            <p v-if="errors.repoPath" style="font-size: 12px; color: #f87171; margin: 6px 0 0">{{ errors.repoPath }}</p>
          </div>
        </div>

        <!-- Section: 执行策略 -->
        <div style="background: #f8fafc; border-radius: 14px; padding: 20px; margin-bottom: 12px">
          <h3 style="font-size: 13px; font-weight: 600; color: #475569; margin: 0 0 20px 0">执行策略</h3>

          <!-- Branch strategy -->
          <div style="margin-bottom: 20px">
            <label style="display: block; font-size: 13px; color: #64748b; margin-bottom: 10px">分支策略</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px">
              <button
                v-for="opt in (['current_branch', 'new_worktree', 'existing_branch'] as const)"
                :key="opt"
                :style="{
                  padding: '10px 8px',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: branchStrategyType === opt ? '#4f46e5' : 'white',
                  color: branchStrategyType === opt ? 'white' : '#94a3b8',
                  boxShadow: branchStrategyType === opt ? '0 4px 12px rgba(79,70,229,0.25)' : 'inset 0 0 0 1.5px #e2e8f0'
                }"
                @click="branchStrategyType = opt"
              >
                {{ opt === 'current_branch' ? '当前分支' : opt === 'new_worktree' ? '新建 Worktree' : '已有分支' }}
              </button>
            </div>
            <input
              v-if="branchStrategyType !== 'current_branch'"
              v-model="branchName"
              type="text"
              style="width: 100%; padding: 12px 16px; border-radius: 12px; font-size: 14px; border: 1.5px solid #e2e8f0; background: white; outline: none; color: #0f172a; box-sizing: border-box; margin-top: 12px"
              :placeholder="branchStrategyType === 'new_worktree' ? 'worktree 名称...' : '分支名称...'"
            />
          </div>

          <!-- Target type -->
          <div>
            <label style="display: block; font-size: 13px; color: #64748b; margin-bottom: 10px">目标输入方式</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px">
              <button
                v-for="opt in (['objective', 'spec_file'] as const)"
                :key="opt"
                :style="{
                  padding: '10px 8px',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: targetType === opt ? '#4f46e5' : 'white',
                  color: targetType === opt ? 'white' : '#94a3b8',
                  boxShadow: targetType === opt ? '0 4px 12px rgba(79,70,229,0.25)' : 'inset 0 0 0 1.5px #e2e8f0'
                }"
                @click="targetType = opt"
              >
                {{ opt === 'objective' ? '目标描述' : 'Spec 文件' }}
              </button>
            </div>
            <textarea
              v-if="targetType === 'objective'"
              v-model="objectiveText"
              rows="3"
              style="width: 100%; padding: 12px 16px; border-radius: 12px; font-size: 14px; border: 1.5px solid #e2e8f0; background: white; outline: none; resize: none; color: #0f172a; box-sizing: border-box; font-family: inherit"
              placeholder="详细描述你希望完成的任务目标..."
            />
            <input
              v-else
              v-model="specPath"
              type="text"
              style="width: 100%; padding: 12px 16px; border-radius: 12px; font-size: 14px; border: 1.5px solid #e2e8f0; background: white; outline: none; color: #0f172a; box-sizing: border-box"
              placeholder=".kiro/specs/my-feature/spec.md"
            />
          </div>
        </div>

        <!-- Section: 高级选项 -->
        <div style="background: #f8fafc; border-radius: 14px; padding: 20px">
          <h3 style="font-size: 13px; font-weight: 600; color: #475569; margin: 0 0 20px 0">高级选项</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px 32px">
            <div style="display: flex; align-items: center; justify-content: space-between">
              <label style="font-size: 14px; color: #64748b">路由档位</label>
              <select
                v-model="tier"
                style="padding: 8px 12px; border-radius: 10px; font-size: 13px; background: white; border: 1.5px solid #e2e8f0; outline: none"
              >
                <option value="auto">Auto</option>
                <option value="light">Light</option>
                <option value="standard">Standard</option>
                <option value="full">Full</option>
              </select>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between">
              <label style="font-size: 14px; color: #64748b">最大迭代数</label>
              <input
                v-model.number="maxIterations"
                type="number"
                min="1"
                max="200"
                style="width: 72px; padding: 8px 12px; border-radius: 10px; font-size: 13px; text-align: right; background: white; border: 1.5px solid #e2e8f0; outline: none"
              />
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between">
              <label style="font-size: 14px; color: #64748b">预算上限</label>
              <input
                v-model.number="maxBudgetUsd"
                type="number"
                min="0"
                step="0.01"
                placeholder="不限"
                style="width: 80px; padding: 8px 12px; border-radius: 10px; font-size: 13px; text-align: right; background: white; border: 1.5px solid #e2e8f0; outline: none"
              />
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between">
              <label style="font-size: 14px; color: #64748b">休眠抑制</label>
              <button
                :style="{
                  position: 'relative',
                  width: '44px',
                  height: '24px',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                  background: sleepInhibit ? '#4f46e5' : '#cbd5e1',
                  flexShrink: 0
                }"
                @click="sleepInhibit = !sleepInhibit"
              >
                <span
                  :style="{
                    position: 'absolute',
                    top: '2px',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: 'white',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    transition: 'left 0.2s',
                    left: sleepInhibit ? '22px' : '2px'
                  }"
                />
              </button>
            </div>
          </div>
        </div>

      </div>

      <!-- Footer — always visible -->
      <div style="padding: 16px 24px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 12px; flex-shrink: 0">
        <button
          style="padding: 12px 24px; border-radius: 12px; font-size: 14px; color: #94a3b8; font-weight: 500; background: none; border: none; cursor: pointer"
          @click="emit('cancel')"
        >
          取消
        </button>
        <button
          :style="{
            padding: '12px 32px',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 600,
            border: 'none',
            cursor: isValid ? 'pointer' : 'not-allowed',
            color: 'white',
            background: isValid ? '#4f46e5' : '#c7d2fe',
            boxShadow: isValid ? '0 4px 12px rgba(79,70,229,0.3)' : 'none',
            transition: 'all 0.2s'
          }"
          :disabled="!isValid"
          @click="emit('submit', buildInput())"
        >
          {{ task ? "保存修改" : "创建任务" }}
        </button>
      </div>
    </div>
  </div>
</template>
