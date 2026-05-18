<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { sendNotification, isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import type { Task, TaskStatus, TaskInput } from "../types/index";
import TaskCard from "./TaskCard.vue";
import FilterBar from "./FilterBar.vue";
import ReviewPanel from "./ReviewPanel.vue";
import TaskFormDialog from "./TaskFormDialog.vue";

const router = useRouter();
const tasks = ref<Task[]>([]);
const loading = ref(false);
const filterStatus = ref<TaskStatus | "all">("all");
const showForm = ref(false);
const editingTask = ref<Task | null>(null);
const reviewTask = ref<Task | null>(null);
const diffContent = ref("");
const reviewReport = ref("");

const filteredTasks = computed(() => {
  if (filterStatus.value === "all") return tasks.value;
  return tasks.value.filter((t) => t.status === filterStatus.value);
});

const filterCounts = computed(() => {
  const counts: Record<string, number> = { all: tasks.value.length };
  for (const t of tasks.value) {
    counts[t.status] = (counts[t.status] || 0) + 1;
  }
  return counts;
});

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
  try {
    await invoke("start_task", { taskId });
    await fetchTasks();
  } catch (e) {
    console.error("Failed to start task:", e);
    alert(String(e));
  }
}

async function handleStop(taskId: string) {
  try {
    await invoke("stop_task", { taskId });
    await fetchTasks();
  } catch (e) {
    console.error("Failed to stop task:", e);
  }
}

async function handleRetry(taskId: string) {
  try {
    const result = await invoke<string>("retry_task", { taskId });
    if (result) {
      await invoke("start_task", { taskId });
    }
    await fetchTasks();
  } catch (e) {
    console.error("Failed to retry task:", e);
    alert(String(e));
  }
}

async function handleDelete(taskId: string) {
  if (!confirm("确认删除此任务？")) return;
  try {
    await invoke("delete_task", { taskId });
    await fetchTasks();
  } catch (e) {
    console.error("Failed to delete task:", e);
  }
}

async function handleReview(taskId: string) {
  const task = tasks.value.find((t) => t.id === taskId);
  if (!task) return;
  reviewTask.value = task;

  try {
    diffContent.value = await invoke<string>("get_diff", {
      taskId,
      repoPath: task.repo_path,
    });
  } catch {
    diffContent.value = "";
  }
  reviewReport.value = "";
}

async function handleApprove(taskId: string) {
  try {
    await invoke("approve_task", { taskId });
    reviewTask.value = null;
    await fetchTasks();
  } catch (e) {
    console.error("Failed to approve:", e);
  }
}

async function handleReject(taskId: string, feedback: string) {
  try {
    await invoke("reject_task", { taskId, feedback });
    reviewTask.value = null;
    await invoke("start_task", { taskId });
    await fetchTasks();
  } catch (e) {
    console.error("Failed to reject:", e);
  }
}

function handleEdit(taskId: string) {
  const task = tasks.value.find((t) => t.id === taskId);
  if (task) {
    editingTask.value = task;
    showForm.value = true;
  }
}

async function handleFormSubmit(input: TaskInput) {
  try {
    if (editingTask.value) {
      await invoke("update_task", { taskId: editingTask.value.id, patch: input });
    } else {
      await invoke("create_task", { input });
    }
    showForm.value = false;
    editingTask.value = null;
    await fetchTasks();
  } catch (e) {
    alert(String(e));
  }
}

function handleFormCancel() {
  showForm.value = false;
  editingTask.value = null;
}

onMounted(async () => {
  await fetchTasks();

  // Listen for process exit events to auto-refresh
  await listen("process-exit", () => {
    fetchTasks();
  });

  // Listen for task-status-update events (progress from StatusWatcher)
  await listen<{ task_id: string; phase: string | null; iteration: number | null; progress_summary: string | null }>(
    "task-status-update",
    (event) => {
      const idx = tasks.value.findIndex((t) => t.id === event.payload.task_id);
      if (idx !== -1) {
        // Trigger reactivity by replacing the task object
        const updated = { ...tasks.value[idx] };
        if (updated.metadata) {
          updated.metadata = { ...updated.metadata };
        }
        tasks.value.splice(idx, 1, updated);
      }
    },
  );

  // Listen for notification-request events and show native notification
  await listen<{ title: string; body: string }>("notification-request", async (event) => {
    try {
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === "granted";
      }
      if (granted) {
        sendNotification({ title: event.payload.title, body: event.payload.body });
      }
    } catch {
      // Notification not available (e.g. in browser preview)
    }
  });
});
</script>

<template>
  <div class="min-h-screen bg-white" :style="{ fontFamily: 'var(--font-body)' }">
    <!-- Header -->
    <header
      class="sticky top-0 z-40 px-6 py-4 flex items-center justify-between"
      style="backdrop-filter: saturate(180%) blur(20px); background: rgba(255,255,255,0.85)"
    >
      <h1
        class="text-[28px] font-semibold tracking-[-0.374px]"
        :style="{ fontFamily: 'var(--font-display)' }"
      >
        Forge Loop
      </h1>
      <div class="flex items-center gap-3">
        <button
          class="p-2 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
          title="设置"
          @click="router.push('/settings')"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="3" stroke="currentColor" stroke-width="1.5"/>
            <path d="M10 1v3M10 16v3M1 10h3M16 10h3M3.5 3.5l2 2M14.5 14.5l2 2M3.5 16.5l2-2M14.5 5.5l2-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
        <button
          class="px-5 py-2 rounded-[var(--rounded-pill)] text-[15px] bg-[var(--color-primary)] text-white font-medium active:scale-[0.97] transition-transform"
          @click="showForm = true; editingTask = null"
        >
          + 新任务
        </button>
      </div>
    </header>

    <!-- Filter bar -->
    <div class="px-6 py-3">
      <FilterBar
        :current="filterStatus"
        :counts="filterCounts"
        @change="filterStatus = $event"
      />
    </div>

    <!-- Task list -->
    <div class="px-6">
      <div v-if="loading" class="py-12 text-center text-[var(--color-ink-muted)] text-[17px]">
        加载中...
      </div>

      <div v-else-if="filteredTasks.length === 0" class="py-12 text-center">
        <p class="text-[var(--color-ink-muted)] text-[17px]">
          {{ filterStatus === "all" ? "暂无任务，点击「+ 新任务」开始" : "该状态下没有任务" }}
        </p>
      </div>

      <div v-else class="space-y-1">
        <TaskCard
          v-for="(task, index) in filteredTasks"
          :key="task.id"
          :task="task"
          :style="{ backgroundColor: index % 2 === 0 ? '#ffffff' : '#f5f5f7' }"
          @start="handleStart"
          @stop="handleStop"
          @review="handleReview"
          @retry="handleRetry"
          @edit="handleEdit"
          @delete="handleDelete"
        />
      </div>
    </div>

    <!-- Task form dialog -->
    <TaskFormDialog
      v-if="showForm"
      :task="editingTask"
      @submit="handleFormSubmit"
      @cancel="handleFormCancel"
    />

    <!-- Review panel -->
    <ReviewPanel
      v-if="reviewTask"
      :task="reviewTask"
      :diff-content="diffContent"
      :review-report="reviewReport"
      @approve="handleApprove"
      @reject="handleReject"
    />
  </div>
</template>
