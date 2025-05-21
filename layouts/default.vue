<script setup lang="ts">

</script>

<template>
  <div style="height: 100vh; width: 100vw;">
    <UNotifications />
    <div style="height: 3%; display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 1rem">
      <UButton label="Поиск компонентов" to="/recognition" :color=" ( useRoute().path === '/recognition') ? 'primary' : 'gray'"/>
      <UButton label="Отчеты" to="/report" :color=" ( useRoute().path === '/report') ? 'primary' : 'gray'"/>
    </div>
    <div style="height: 97%">
      <slot/>
    </div>
  </div>
</template>

<style>
:root{
  background: linear-gradient(30deg, #30303040, #40202040, #20402040, #20204040, #10101040);
  backdrop-filter: blur();
}
</style>