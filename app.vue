<script setup lang="ts">
import {useNetworkStore} from "~/stores/network";

onMounted(async () => {
  let database_host = await useFetch("/api/database_host");
  await database_host.execute();
  let database_host_str = database_host.data.value;
  if (database_host_str == undefined) {
    alert(
        "backend variable not set (did you set DATABASE_HOST in your environment?): " +
        database_host.error.value,
    );
    return;
  }

  let predict_host = await useFetch("/api/predict_host");
  await predict_host.execute();
  let predict_host_str = predict_host.data.value;
  if (predict_host_str == undefined) {
    alert(
        "backend variable not set (did you set PREDICT_HOST in your environment?): " +
        predict_host.error.value,
    );
    return;
  }

  let report_host = await useFetch("/api/report_host");
  await report_host.execute();
  let report_host_str = report_host.data.value;
  if (report_host_str == undefined) {
    alert(
        "backend variable not set (did you set REPORT_HOST in your environment?): " +
        report_host.error.value,
    );
    return;
  }

  useNetworkStore().setBackendHosts(database_host_str, predict_host_str, report_host_str);
});
</script>

<template>
  <NuxtLayout>
    <NuxtPage/>
  </NuxtLayout>
</template>
<style>

</style>