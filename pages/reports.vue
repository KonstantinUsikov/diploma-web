<script setup lang="ts">
import {useFileDialog} from "@vueuse/core";
import pdfJSWorkerURL from "pdfjs-dist/build/pdf.worker?url"
import {getDocument, GlobalWorkerOptions} from "pdfjs-dist";

import {createApp} from 'vue'
import App from '../app.vue'
import 'viewerjs/dist/viewer.css'
import VueViewer, {api as ViewerApi, component as Viewer} from 'v-viewer'
import {useNetworkStore} from "~/stores/network";
import {ofetch} from "ofetch";
import {awaitExpression} from "@babel/types";
import VCodeBlock from "@wdns/vue-code-block";

onMounted(async () => {
  const app = createApp(App)
  app.use(VueViewer)
  app.mount('#app')
})

const report_loaded = ref(false);
const active_process = ref(false);

const rep_id = ref(-1)
const clean_img = ref("")

const columns = [{
  key: 'id',
  label: 'ID',
  sortable: true
}, {
  key: 'image',
  label: 'Image',
  sortable: true
}, {
  key: 'cls',
  label: 'Class',
  sortable: true
}, {
  key: 'action',
  label: '',
  sortable: false
}]

const current_data = ref([]);
const current_cluster_count = ref(0)

const load_report = async () => {
  active_process.value = true
  try{
    let res = await ofetch(`${useNetworkStore().report_host}/api/report/get_report`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })
    clean_img.value = `data:image/jpg;base64,${res.clean}`
    rep_id.value = res.id
    current_data.value = []
    for (let i = 0; i < res.shapes.length; i++) {
      current_data.value.push({
        id: i,
        image: `data:image/jpg;base64,${res.shapes[i].img}`,
        cls: res.shapes[i].cls,
        score: res.shapes[i].score,
        x: res.shapes[i].x,
        y: res.shapes[i].y,
        w: res.shapes[i].w,
        h: res.shapes[i].h,
        cluster_id: res.shapes[i].cluster_id
      })
    }
    current_cluster_count.value = res.unique_cluster_count
    active_process.value = false
    report_loaded.value = true
  }
  catch (e){
    alert(e)
    active_process.value = false
  }
}

const remove_report = async () => {
  active_process.value = true
  try{
    let res = await ofetch(`${useNetworkStore().report_host}/api/report/delete_report`, {
      method: 'POST',
      body: JSON.stringify({"id": rep_id.value}),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })
  }
  catch (e){
    alert(e)
    active_process.value = false
    return
  }
  clean_img.value = ""
  current_data.value = []
  report_loaded.value = false
  active_process.value = false
}
const datasets = ref([])
const chosen_dataset = ref("")
const send_report = async () => {
  active_process.value = true
  try{
    let res = await ofetch(`${useNetworkStore().report_host}/api/report/send_report`, {
      method: 'POST',
      body: {"id": rep_id.value,
        "pr_name": chosen_dataset.value},
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })
  }
  catch (e){
    alert(e)
    active_process.value = false
  }
  clean_img.value = ""
  current_data.value = []
  report_loaded.value = false
  active_process.value = false
}

const download_specific = async (img_id: number) => {
  let download_link = document.createElement('a')
  download_link.href = current_data.value[img_id].image
  download_link.download = `comp_${rep_id.value}_${img_id}.png`
  download_link.click()
}

const clusters = ref([])
const viewing_clusters = ref(false)
const view_clusters = async () => {
  active_process.value = true
  try {
    let res = await ofetch(`${useNetworkStore().report_host}/api/report/get_clusters`)
    let new_clusters = []
    for (let i = 0; i < res.length; i++) {
      const images = []
      for (const element of res[i].images) {
        images.push(`data:image/jpg;base64,${element}`)
      }
      new_clusters.push({
        id: i,
        images: images,
        name: res[i].name,
      })
    }
    clusters.value = new_clusters
    active_process.value = false
    viewing_clusters.value = true
  }
  catch (e) {
    alert(e)
    active_process.value = false
  }
}

const img_elem = ref(null);
const original_width = computedAsync(async () => {
  let img = document.createElement("img");
  img.src = clean_img.value;
  await img.decode();
  const width = img.naturalWidth;
  img.remove();
  return width;
});
const original_height = computedAsync(async () => {
  let img = document.createElement("img");
  img.src = clean_img.value;
  await img.decode();
  const height = img.naturalHeight;
  img.remove();
  return height;
});
const img_elem_factor = computed(() => {
  return img_elem.value?.width / original_width?.value;
});
const simplified_detections = computed(() => {
  let result = [];
  for (let entry of current_data.value) {
    result.push({
      id: entry.id,
      cls: entry.cls,
      conf: entry.score,
      x: entry.x,
      y: entry.y,
      w: entry.w,
      h: entry.h,
      cluster_id: entry.cluster_id
    });
  }
  return result;
});
const unique_clusters = computed(() => {
  let result = [];
  for (let entry of current_data.value) {
    if (!result.includes(entry.cluster_id)) {
      result.push(entry.cluster_id);
    }
  }
  return result;
})
const cluster_gradient = computed(() => {
  let result = {};
  let clusters = unique_clusters.value.length;

  for (let i = 0; i < clusters; i++) {
    let pos = i / (clusters - 1);
    let hue;

    if (pos < 1 / 3) {
      hue = pos * 3 * 90;
    } else if (pos < 2 / 3) {
      hue = 150 + (pos - 1 / 3) * 3 * 60;
    } else {
      hue = 270 + (pos - 2 / 3) * 3 * 90;
    }

    result[unique_clusters.value[i]] = hue;
  }

  return result;
});

const current_viewer = ref<Viewer>(null);
const current_image_data = ref({});
const computed_viewer = ref(null);
useInterval(1000 / 60, {
  callback: () => {
    let elem = document.getElementById("img_element");
    if (elem != null) {
      img_elem.value = elem.getBoundingClientRect();
    }
    if (current_viewer.value != null) {
      current_image_data.value = current_viewer.value.imageData;
      if (!current_viewer.value.ready) {
        current_viewer.value = null;
      }
    }
    computed_viewer.value = {
      transform: (() => {
        if (current_viewer.value != null) {
          return `scale(${current_image_data.value?.ratio})`;
        } else return `scale(${img_elem_factor.value ?? 1})`;
      })(),
      left: (() => {
        if (current_viewer.value != null) {
          return `${current_image_data.value?.left}px`;
        } else return "";
      })(),
      top: (() => {
        if (current_viewer.value != null) {
          return `${current_image_data.value?.top}px`;
        } else return "";
      })(),
    };
  },
});

const { x, y } = useMouse()
const { y: windowY } = useWindowScroll()

const context_open = ref(false)
const virtualElement = ref({ getBoundingClientRect: () => ({}) })
const context_data = ref({})

function onContextMenu(data: {}) {
  const top = unref(y) - unref(windowY)
  const left = unref(x)

  virtualElement.value.getBoundingClientRect = () => ({
    width: 0,
    height: 0,
    top,
    left
  })

  context_open.value = true

  if (data.id != -1) {
    context_data.value = simplified_detections.value[data.id]
  } else {
    context_data.value = data
  }
}

</script>

<template>
  <client-only>
    <div style="display: flex; flex-direction: column; height: 100%; width: 100%">
      <div style="display: flex; flex-direction: row; height: 95%; width: 100%; margin-bottom: 0.5rem">
        <div class="contain" style="height: 100%; width: 60%; overflow: clip">
          <p>Схема</p>
          <UDivider/>
          <div
              :style="computed_viewer"
              style="
              position: absolute;
              z-index: 2016;
              height: 0;
              overflow: visible;
              pointer-events: none;
              background: none !important;
            "
          >
            <div v-for="det in simplified_detections">
              <div
                  :style="{
                  marginLeft: `${det.x - det.w / 2}px`,
                  marginTop: `${det.y - det.h / 2}px`,
                  width: `${det.w}px`,
                  height: `${det.h}px`,
                  background: (() => {
                    if (det.cls === 'text') {
                      return `rgba(0, 0, ${Math.max(det.conf, 0.5) * 255}, 0.2)`;
                    } else if (det.cls !== '-') {
                      return `rgba(0, ${Math.max(det.conf, 0.5) * 255}, 0, 0.2)`;
                    } else if (det.cluster_id != null){
                      return `hsla(${cluster_gradient[det.cluster_id]}, 100%, 50%, 0.2)`;
                    } else {
                      return `rgba(64, 64, 64, 0.2)`;
                    }
                  })(),
                  borderColor: (() => {
                    if (det.cls === 'text') {
                      return `rgba(0, 0, ${Math.max(det.conf, 0.5) * 255}, 0.6)`;
                    } else if (det.cls !== '-') {
                      return `rgba(0, ${Math.max(det.conf, 0.5) * 255}, 0, 0.6)`;
                    } else if (det.cluster_id != null){
                      return `hsla(${cluster_gradient[det.cluster_id]}, 100%, 50%, 0.6)`;
                    } else {
                      return `rgba(64, 64, 64, 0.6)`;
                    }
                  })(),
                }"
                  style="
                  position: absolute;
                  border-width: 1px;
                  border-radius: 0.25rem;
                  z-index: 2;
                  pointer-events: painted;
                "
                  @click="
                  (() => {
                    if (current_viewer == null)
                      current_viewer = ViewerApi({ images: [clean_img] });
                  })()
                "
                  @contextmenu.prevent="onContextMenu(det)"
              />
            </div>
          </div>
          <UContextMenu style="z-index: 2017" v-model="context_open" :virtual-element="virtualElement">
            <VCodeBlock :code="JSON.stringify(context_data)" highlightjs lang="json" :theme="useColorMode().value === 'dark' ? 'neon-bunny' : 'atom-one-light'"/>
          </UContextMenu>
          <NuxtImg
              id="img_element"
              :src="clean_img"
              @click="
                (() => {
                  if (current_viewer == null)
                    current_viewer = ViewerApi({ images: [clean_img] });
                })()
              "
          ></NuxtImg>
        </div>
        <div class="contain" style="height: 100%; width: 40%; display: flex; flex-direction: column">
          <p>Компоненты</p>
          <UDivider/>
          <div style="height: 100%; overflow-y: scroll">
            <UTable :columns="columns" :rows="current_data">
              <template #image-data="{row}">
                <NuxtImg :src="row.image"></NuxtImg>
              </template>
              <template #action-data="{row}">
                <UButton label="Download" @click="download_specific(row.id)"/>
              </template>
            </UTable>
          </div>

        </div>
      </div>
      <div
          style="display: flex; flex-direction: row; gap: 1rem; align-items: center; justify-content: center; height: 5%; width: 100%">
        <UButton label="Получить кластеры" @click="view_clusters" v-bind:disabled="active_process"/>
        <UButton label="Получить отчет" @click="load_report" v-bind:disabled="active_process" :loading="active_process"/>
        <UButton class="until-rep" label="Удалить отчет" @click="remove_report" v-bind:disabled="active_process"/>

      </div>
    </div>
    <UModal v-model="viewing_clusters" :ui="{width: 'sm:max-w-[80vw]'}" style="z-index: 3000">
      <UCard>
        <template #header>
          <h1>Clusters</h1>
        </template>
        <div v-for="cluster in clusters">
          <p>{{cluster.name}}</p>
          <UDivider/>
          <Viewer :images="cluster.images">
            <div style="display: flex; flex-direction: row; gap: 0.25rem; flex-wrap: wrap">
              <NuxtImg v-for="img in cluster.images" :src="img" style="height: 150px"></NuxtImg>
            </div>
          </Viewer>
          <UDivider/>
        </div>
      </UCard>
    </UModal>
  </client-only>
</template>

<style scoped>
.contain {
  background-color: #A0A0A010;
  border-radius: 1rem;
  padding: 1rem;
  margin: 1rem;
}

.until-rep{
  display: v-bind("!report_loaded ? 'none' : ''");
}
</style>