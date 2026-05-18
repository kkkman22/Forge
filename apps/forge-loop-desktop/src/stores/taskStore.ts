import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type {
  Task,
  TaskInput,
  TaskId,
  TaskStatus,
} from "../types/index";

export const useTaskStore = defineStore("tasks", () => {
  const tasks = ref<Task[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const filterStatus = ref<TaskStatus | "all">("all");

  const filteredTasks = computed(() => {
    if (filterStatus.value === "all") return tasks.value;
    return tasks.value.filter((t) => t.status === filterStatus.value);
  });

  const recentRepos = ref<string[]>([]);

  async function fetchTasks() {
    loading.value = true;
    error.value = null;
    try {
      tasks.value = await invoke<Task[]>("list_tasks");
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  }

  async function createTask(input: TaskInput) {
    error.value = null;
    try {
      const task = await invoke<Task>("create_task", { input });
      tasks.value.push(task);
      return task;
    } catch (e) {
      error.value = String(e);
      throw e;
    }
  }

  async function updateTask(taskId: TaskId, patch: TaskInput) {
    error.value = null;
    try {
      const updated = await invoke<Task>("update_task", { taskId, patch });
      const idx = tasks.value.findIndex((t) => t.id === taskId);
      if (idx !== -1) tasks.value[idx] = updated;
      return updated;
    } catch (e) {
      error.value = String(e);
      throw e;
    }
  }

  async function deleteTask(taskId: TaskId) {
    error.value = null;
    try {
      await invoke("delete_task", { taskId });
      tasks.value = tasks.value.filter((t) => t.id !== taskId);
    } catch (e) {
      error.value = String(e);
      throw e;
    }
  }

  async function reorderTask(taskId: TaskId, newIndex: number) {
    error.value = null;
    try {
      await invoke("reorder_task", { taskId, newIndex });
      await fetchTasks();
    } catch (e) {
      error.value = String(e);
      throw e;
    }
  }

  async function fetchRecentRepos() {
    try {
      recentRepos.value = await invoke<string[]>("get_recent_repos");
    } catch (e) {
      // silently fail
    }
  }

  function setFilter(status: TaskStatus | "all") {
    filterStatus.value = status;
  }

  return {
    tasks,
    loading,
    error,
    filterStatus,
    filteredTasks,
    recentRepos,
    fetchTasks,
    createTask,
    updateTask,
    deleteTask,
    reorderTask,
    fetchRecentRepos,
    setFilter,
  };
});
