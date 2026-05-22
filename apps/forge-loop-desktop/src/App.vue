<script setup lang="ts">
import { RouterView } from "vue-router";
</script>

<template>
  <div style="height: 100vh; overflow: hidden; display: flex; flex-direction: column">
    <main style="flex: 1; overflow-y: auto; background: #f8fafc">
      <RouterView />
    </main>
  </div>
</template>
