<script lang="ts" setup>
import { useFileDialog } from "@vueuse/core";
import pdfJSWorkerURL from "pdfjs-dist/build/pdf.worker?url";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import { createApp } from "vue";
import App from "../app.vue";
import "viewerjs/dist/viewer.css";
import VueViewer, { api as ViewerApi } from "v-viewer";
import VCodeBlock from "@wdns/vue-code-block";
import {useNetworkStore} from "~/stores/network";
import {ofetch} from "ofetch";

GlobalWorkerOptions.workerSrc = pdfJSWorkerURL;

onMounted(async () => {
  const app = createApp(App);
  app.use(VueViewer);
  app.mount("#app");
});

const img_loaded = ref(false);
const active_process = ref(false);
const has_processed = ref(false);
const clean_img = ref("");
const pdf_version = ref("");

const current_data = ref([]);
const unknowns = ref([]);

const img_load = () => {
  let dialog = useFileDialog({
    accept: ".png,.jpg,.jpeg,.pdf,.webp",
  });
  dialog.onChange((files) => {
    img_loaded.value = false;
    active_process.value = true;
    has_processed.value = false;
    let reader = new FileReader();
    if (files[0].type === "application/pdf") {
      reader.onload = () => {
        let rd2 = new FileReader();
        rd2.onload = () => {
          pdf_version.value = rd2.result as string;
        }
        rd2.readAsDataURL(files[0]);
        getDocument(reader.result as ArrayBuffer).promise.then((pd) => {
          pd.getPage(1).then((page) => {
            let scale = 12;
            let viewport;
            while (true) {
              viewport = page.getViewport({ scale: scale });
              if (viewport.height * viewport.width > 2e7) {
                scale *= 0.9;
                continue;
              }
              break;
            }
            let canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            let ctx = canvas.getContext("2d");
            page
                .render({ canvasContext: ctx, viewport: viewport })
                .promise.then((res) => {
              clean_img.value = canvas.toDataURL("image/png");
              current_data.value = [];
              unknowns.value = [];
              img_loaded.value = true;
              active_process.value = false;
            });
          });
        });
      };
      reader.readAsArrayBuffer(files[0]);
    } else {
      reader.onload = () => {
        clean_img.value = reader.result as string;
        pdf_version.value = "";
        current_data.value = [];
        unknowns.value = [];
        img_loaded.value = true;
        active_process.value = false;
      };
      reader.readAsDataURL(files[0]);
    }
  });
  dialog.open();
};

const send_img = async () => {
  active_process.value = true;
  try{
    let res = await ofetch(`${useNetworkStore().predict_host}/api/predict/predict`, {
      method: "POST",
      body: JSON.stringify({
        image: pdf_version.value !== "" ? pdf_version.value : clean_img.value
      }),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
    });
    current_data.value = res.boxes;
    unknowns.value = res.unknowns;
    active_process.value = false;
    has_processed.value = true;
  }
  catch (e){
    alert(e)
    active_process.value = false;
    has_processed.value = false;
    return
  }
};


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
      cls: entry.majorClass,
      conf: entry.confidence,
      conn: entry.connection,
      x: entry.x * original_width.value,
      y: entry.y * original_height.value,
      w: entry.w * original_width.value,
      h: entry.h * original_height.value,
    });
  }
  return result;
});
const hover_det_id = ref(-1);
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

  context_data.value = data
  // if (data.id != -1) {
  //   context_data.value = current_data.value[data.id]
  // } else {
  //   context_data.value = data
  // }
}

</script>




<template>
  <client-only>
    <div style="display: flex; flex-direction: column; height: 100%; width: 100%">
      <div
          style="
          display: flex;
          flex-direction: row;
          height: 95%;
          width: 100%;
          margin-bottom: 0.5rem;
        "
      >
        <div class="contain" style="height: 100%; width: 20%; overflow: clip"/>
        <div class="contain" style="height: 100%; width: 60%; overflow: clip">
          <p>Схема</p>
          <UDivider />
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
            <div v-for="comp in unknowns">
              <div
                  :style="{
                  marginLeft: `${comp.x * original_width - comp.w * original_width / 2}px`,
                  marginTop: `${comp.y * original_height - comp.h * original_height / 2}px`,
                  width: `${comp.w * original_width}px`,
                  height: `${comp.h * original_height}px`,
                  background: `rgba(255, 0, 0, 0.2)`,
                  borderColor: `rgba(255, 0, 0, 0.6)`,
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
                  @contextmenu.prevent="onContextMenu(comp)"
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
        <div class="contain" style="height: 100%; width: 20%; overflow: clip"/>
      </div>

      <div
          style="
          display: flex;
          flex-direction: row;
          gap: 1rem;
          align-items: center;
          justify-content: center;
          height: 5%;
          width: 100%;
        "
      >
        <UButton
            label="Загрузить схему"
            v-bind:disabled="active_process"
            @click="img_load"
        />
        <UButton
            id="send_btn"
            label="Обработать схему"
            v-bind:disabled="active_process || has_processed"
            @click="send_img"
        />
      </div>
    </div>
  </client-only>
</template>

<style scoped>
#send_btn {
  display: v-bind("!img_loaded ? 'none' : ''");
}

.contain {
  background-color: #a0a0a010;
  border-radius: 1rem;
  padding: 1rem;
  margin: 1rem;
}
</style>