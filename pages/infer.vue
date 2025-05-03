<script lang="ts" setup>
import { useFileDialog } from "@vueuse/core";
import pdfJSWorkerURL from "pdfjs-dist/build/pdf.worker?url";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import "viewerjs/dist/viewer.css";
import { api as ViewerApi } from "v-viewer";
import VCodeBlock from "@wdns/vue-code-block";
import {useNetworkStore} from "~/stores/network";
import {ofetch} from "ofetch";

GlobalWorkerOptions.workerSrc = pdfJSWorkerURL;

interface UnknownComponent {
  id: number
  x: number
  y: number
  w: number
  h: number
  image: string
}

interface RecognizedComponent extends UnknownComponent {
  class_name: string
  confidence: number
}

interface PredictResponse {
  circuit_id: number
  circuit_image: string
  recognized_components: RecognizedComponent[]
  unknown_components: UnknownComponent[]
}

const is_circuit_loaded = ref(false);
const has_circuit_processed = ref(false);
const has_active_process = ref(false);

const circuit_image = ref("");
const circuit_pdf = ref("");
const recognized_components = ref<RecognizedComponent[]>([]);
const unknown_components = ref<UnknownComponent[]>([]);

const load_circuit = () => {
  const dialog = useFileDialog({
    accept: ".png,.jpg,.jpeg,.pdf",
  });
  dialog.onChange((files) => {
    if (!files || files.length === 0)
      return;

    is_circuit_loaded.value = false;
    has_circuit_processed.value = false;
    has_active_process.value = true;

    const reader = new FileReader();
    if (files[0].type === "application/pdf") {
      reader.onload = () => {
        const reader2 = new FileReader();
        reader2.onload = () => {
          circuit_pdf.value = reader2.result as string;
        }
        reader2.readAsDataURL(files[0]);

        getDocument(reader.result as ArrayBuffer).promise.then((pd) => {
          pd.getPage(1).then((page) => {
            let scale = 12;
            let viewport = page.getViewport({ scale });
            const MAX_PIXELS = 2e7;
            const MIN_SCALE = 0.1;
            const SCALE_STEP = 0.9;
            while (viewport.width * viewport.height > MAX_PIXELS && scale > MIN_SCALE) {
              scale *= SCALE_STEP;
              viewport = page.getViewport({ scale });
            }

            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              console.error("Canvas 2D context не получен");
              has_active_process.value = false;
              return;
            }

            page
                .render({ canvasContext: ctx, viewport: viewport })
                .promise.then((_res) => {
              circuit_image.value = canvas.toDataURL("image/png");
              recognized_components.value = [];
              unknown_components.value = [];
              is_circuit_loaded.value = true;
              has_active_process.value = false;
            });
          });
        });
      };
      reader.readAsArrayBuffer(files[0]);
    }
    else {
      reader.onload = () => {
        circuit_image.value = reader.result as string;
        circuit_pdf.value = "";
        recognized_components.value = [];
        unknown_components.value = [];
        is_circuit_loaded.value = true;
        has_active_process.value = false;
      };
      reader.readAsDataURL(files[0]);
    }
  });
  dialog.open();
};

const send_circuit = async () => {
  has_active_process.value = true;
  try {
    const predict_response = await ofetch<PredictResponse>(`${useNetworkStore().predict_host}/api/predict/run_prediction`, {
      method: "POST",
      body: {
        circuit_data: circuit_pdf.value !== "" ? circuit_pdf.value : circuit_image.value,
        config: {
          "thresh_value": parameters.thresh_value,
          "line_length": parameters.line_length,
          "min_line_length": parameters.min_line_length,
          "max_line_gap": parameters.max_line_gap,
          "line_repair_kernel_size": parameters.line_repair_kernel_size,
          "dilate_kernel_size": parameters.dilate_kernel_size,
          "dilate_iterations": parameters.dilate_iterations,
          "erode_kernel_size": parameters.erode_kernel_size,
          "erode_iterations": parameters.erode_iterations,
          "component_min_area": parameters.component_min_area,
          "component_min_width": parameters.component_min_width,
          "component_min_height": parameters.component_min_height,
          "component_max_area": parameters.component_max_area,
          "component_max_width": parameters.component_max_width,
          "component_max_height": parameters.component_max_height,
          "component_max_side_multiplier": parameters.component_max_side_multiplier,
          "contour_min_width": parameters.contour_min_width,
          "contour_min_height": parameters.contour_min_height,
          "contour_max_area": parameters.contour_max_area,
          "max_pixel_count_to_use_remove_lines_modified": parameters.max_pixel_count_to_use_remove_lines_modified,
          "min_multiplier_to_count_as_component_part": parameters.min_multiplier_to_count_as_component_part,
          "max_threshold_to_merge_boxes": parameters.max_threshold_to_merge_boxes,
          "box_increase_factor": parameters.box_increase_factor
        }
      },
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
    });

    recognized_components.value = predict_response.recognized_components;
    unknown_components.value = predict_response.unknown_components;
    has_circuit_processed.value = true;
  } catch (e) {
    console.error("Ошибка при отправке схемы:", e);
    alert("Произошла ошибка при обработке схемы.");
    has_circuit_processed.value = false;
  } finally {
    has_active_process.value = false;
  }
};


const original_width = computedAsync(async () => {
  const img = document.createElement("img");
  img.src = circuit_image.value;
  await img.decode();
  const width = img.naturalWidth;
  img.remove();
  return width;
});

const original_height = computedAsync(async () => {
  const img = document.createElement("img");
  img.src = circuit_image.value;
  await img.decode();
  const height = img.naturalHeight;
  img.remove();
  return height;
});

const image_element = ref(null);
const image_element_factor = computed(() => {
  const width = image_element.value?.width ?? 0;
  const original = original_width.value ?? 1;
  return width / original;
});


const current_viewer = ref<Viewer>(null);
const current_image_data = ref({});
const computed_viewer = ref(null);
useInterval(1000 / 60, {
  callback: () => {
    const circuit_image_element = document.getElementById("circuit_image_element");
    if (circuit_image_element != null) {
      image_element.value = circuit_image_element.getBoundingClientRect();
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
        } else return `scale(${image_element_factor.value ?? 1})`;
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
}

function onContextMenuSafe(component: RecognizedComponent | UnknownComponent) {
  const { image, ...dataWithoutImage } = component;
  onContextMenu(dataWithoutImage);
}


const unique_class_names = computed(() => {
  const result: string[] = [];
  for (const recognized_component of recognized_components.value) {
    if (!result.includes(recognized_component.class_name)) {
      result.push(recognized_component.class_name);
    }
  }
  return result;
})

const class_names_gradient = computed(() => {
  const result: Record<string, number> = {};
  const class_names_count = unique_class_names.value.length;

  for (let i = 0; i < class_names_count; i++) {
    const pos = i / class_names_count; // делим на count, не count - 1
    const hue = pos * 360;
    result[unique_class_names.value[i]] = hue;
  }

  return result;
});


const columns = [
  { key: "id", label: "ID", sortable: true },
  { key: "x", label: "X", sortable: true },
  { key: "y", label: "Y", sortable: true },
  { key: "w", label: "W", sortable: true },
  { key: "h", label: "H", sortable: true },
  { key: "class_name", label: "Class name", sortable: true },
  { key: "confidence", label: "Confidence", sortable: true },
];

const rows = computed(() => {
  return (recognized_components.value ?? []).map(component => ({
    ...component,
    x: component.x.toFixed(3),
    y: component.y.toFixed(3),
    w: component.w.toFixed(3),
    h: component.h.toFixed(3),
    confidence: component.confidence.toFixed(3),
  }));
});


const parameterLimits = {
  thresh_value: { min: 0, max: 255 },
  line_length: { min: 1, max: 1e5 },
  min_line_length: { min: 1, max: 1e5 },
  max_line_gap: { min: 0, max: 1e5 },
  line_repair_kernel_size: { min: 1, max: 49 },
  dilate_kernel_size: { min: 1, max: 49 },
  dilate_iterations: { min: 0, max: 15 },
  erode_kernel_size: { min: 1, max: 49 },
  erode_iterations: { min: 0, max: 15 },
  component_min_area: { min: 1, max: 1e9 },
  component_min_width: { min: 1, max: 1e5 },
  component_min_height: { min: 1, max: 1e5 },
  component_max_area: { min: 1, max: 1e9 },
  component_max_width: { min: 1, max: 1e5 },
  component_max_height: { min: 1, max: 1e5 },
  component_max_side_multiplier: { min: 1, max: 100 },
  contour_min_width: { min: 1, max: 1e5 },
  contour_min_height: { min: 1, max: 1e5 },
  contour_max_area: { min: 1, max: 1e9 },
  max_pixel_count_to_use_remove_lines_modified: { min: 1, max: 1e9 },
  min_multiplier_to_count_as_component_part: { min: 1, max: 1e5 },
  max_threshold_to_merge_boxes: { min: 0, max: 1e9 },
  box_increase_factor: { min: 0, max: 2 },
}

const parameters = reactive({
  thresh_value: 250,
  line_length: 35,
  min_line_length: 150,
  max_line_gap: 100,
  line_repair_kernel_size: 7,
  dilate_kernel_size: 3,
  dilate_iterations: 0,
  erode_kernel_size: 7,
  erode_iterations: 1,
  component_min_area: 1300,
  component_min_width: 25,
  component_min_height: 25,
  component_max_area: 10000,
  component_max_width: 500,
  component_max_height: 500,
  component_max_side_multiplier: 3.5,
  contour_min_width: 10,
  contour_min_height: 10,
  contour_max_area: 350000,
  max_pixel_count_to_use_remove_lines_modified: 500000000,
  min_multiplier_to_count_as_component_part: 10,
  max_threshold_to_merge_boxes: 0.5,
  box_increase_factor: 0.1,
})

watchEffect(() => {
  for (const key in parameterLimits) {
    const { min, max } = parameterLimits[key]
    const value = parameters[key]
    if (value < min) parameters[key] = min
    else if (value > max) parameters[key] = max
  }
})

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
        <div class="contain" style="height: 100%; width: 20%; display: flex; flex-direction: column; overflow: hidden;">
          <div style="display: flex; flex-direction: column; gap: 0.5rem">
            <p>Параметры поиска компонентов</p>
            <UDivider />
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">thresh_value</p>
              <UInput
                  v-model="parameters.thresh_value"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">line_length</p>
              <UInput
                  v-model="parameters.line_length"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">min_line_length</p>
              <UInput
                  v-model="parameters.min_line_length"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">max_line_gap</p>
              <UInput
                  v-model="parameters.max_line_gap"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">line_repair_kernel_size</p>
              <UInput
                  v-model="parameters.line_repair_kernel_size"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">dilate_kernel_size</p>
              <UInput
                  v-model="parameters.dilate_kernel_size"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">dilate_iterations</p>
              <UInput
                  v-model="parameters.dilate_iterations"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">erode_kernel_size</p>
              <UInput
                  v-model="parameters.erode_kernel_size"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">erode_iterations</p>
              <UInput
                  v-model="parameters.erode_iterations"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">component_min_area</p>
              <UInput
                  v-model="parameters.component_min_area"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">component_min_width</p>
              <UInput
                  v-model="parameters.component_min_width"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">component_min_height</p>
              <UInput
                  v-model="parameters.component_min_height"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">component_max_area</p>
              <UInput
                  v-model="parameters.component_max_area"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">component_max_width</p>
              <UInput
                  v-model="parameters.component_max_width"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">component_max_height</p>
              <UInput
                  v-model="parameters.component_max_height"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">max_side_multiplier</p>
              <UInput
                  v-model="parameters.component_max_side_multiplier"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">contour_min_width</p>
              <UInput
                  v-model="parameters.contour_min_width"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">contour_min_height</p>
              <UInput
                  v-model="parameters.contour_min_height"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">contour_max_area</p>
              <UInput
                  v-model="parameters.contour_max_area"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">max_pixel_count_rlm</p>
              <UInput
                  v-model="parameters.max_pixel_count_to_use_remove_lines_modified"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">min_mul_to_count_part</p>
              <UInput
                  v-model="parameters.min_multiplier_to_count_as_component_part"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">max_threshold_merge</p>
              <UInput
                  v-model="parameters.max_threshold_to_merge_boxes"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
            <div style="display: flex; flex-direction: row; gap: 1rem">
              <p style="width: 200px">box_increase_factor</p>
              <UInput
                  v-model="parameters.box_increase_factor"
                  placeholder=""
                  type="number"
                  style="height: 28px; padding: 2px 6px; font-size: 14px"
              />
            </div>
          </div>


        </div>
        <div class="contain" style="height: 100%; width: 40%; overflow: clip">
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
            <div v-for="recognized_component in recognized_components" :key="recognized_component.id">
              <div
                  :style="{
                  marginLeft: `${recognized_component.x * original_width - recognized_component.w * original_width / 2}px`,
                  marginTop: `${recognized_component.y * original_height - recognized_component.h * original_height / 2}px`,
                  width: `${recognized_component.w * original_width}px`,
                  height: `${recognized_component.h * original_height}px`,
                  background: `hsla(${class_names_gradient[recognized_component.class_name]}, 100%, 50%, 0.2)`,
                  borderColor: `hsla(${class_names_gradient[recognized_component.class_name]}, 100%, 50%, 0.2)`,
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
                      current_viewer = ViewerApi({ images: [circuit_image] });
                  })()
                "
                  @contextmenu.prevent="onContextMenuSafe(recognized_component)"
              />
            </div>

            <div v-for="unknown_component in unknown_components" :key="unknown_component.id">
              <div
                  :style="{
                  marginLeft: `${unknown_component.x * original_width - unknown_component.w * original_width / 2}px`,
                  marginTop: `${unknown_component.y * original_height - unknown_component.h * original_height / 2}px`,
                  width: `${unknown_component.w * original_width}px`,
                  height: `${unknown_component.h * original_height}px`,
                  background: `rgba(128, 128, 128, 0.2)`,
                  borderColor: `rgba(128, 128, 128, 0.6)`,
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
                      current_viewer = ViewerApi({ images: [circuit_image] });
                  })()
                "
                  @contextmenu.prevent="onContextMenuSafe(unknown_component)"
              />
            </div>
          </div>
          <UContextMenu style="z-index: 2017" v-model="context_open" :virtual-element="virtualElement">
            <VCodeBlock :code="JSON.stringify(context_data)" highlightjs lang="json" :theme="useColorMode().value === 'dark' ? 'neon-bunny' : 'atom-one-light'"/>
          </UContextMenu>
          <NuxtImg
              id="circuit_image_element"
              :src="circuit_image"
              @click="
                (() => {
                  if (current_viewer == null)
                    current_viewer = ViewerApi({ images: [circuit_image] });
                })()
              "
          ></NuxtImg>
        </div>

        <div class="contain" style="height: 100%; width: 40%; display: flex; flex-direction: column; overflow: hidden;">
          <p>Найденные копоненты</p>
          <UDivider />
            <div style="height: 100%; overflow-y: scroll">
              <UTable
                  :columns="columns"
                  :rows="rows"
              />
            </div>
        </div>
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
            :disabled="has_active_process"
            @click="load_circuit"
        />
        <UButton
            id="send_btn"
            label="Обработать схему"
            :disabled="has_active_process || has_circuit_processed"
            :loading="has_active_process"
            @click="send_circuit"
        />
      </div>
    </div>
  </client-only>
</template>

<style scoped>
#send_btn {
  display: v-bind("!is_circuit_loaded ? 'none' : ''");
}

.contain {
  background-color: #a0a0a010;
  border-radius: 1rem;
  padding: 1rem;
  margin: 1rem;
}
</style>