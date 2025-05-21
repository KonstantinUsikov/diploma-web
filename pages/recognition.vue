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


const toast = useToast();
const has_active_process = ref(false);
const is_circuit_loading = ref(false);
const is_circuit_processing = ref(false);
const is_circuit_ready_for_processing = ref(false);

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

    has_active_process.value = true;
    is_circuit_loading.value = true;

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
              has_active_process.value = false;
              is_circuit_loading.value = false;
              return;
            }

            page
                .render({ canvasContext: ctx, viewport: viewport })
                .promise.then((_res) => {
              circuit_image.value = canvas.toDataURL("image/png");
              recognized_components.value = [];
              unknown_components.value = [];
              is_circuit_ready_for_processing.value = true;
              has_active_process.value = false;
              is_circuit_loading.value = false;
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
        is_circuit_ready_for_processing.value = true;
        has_active_process.value = false;
      };
      reader.readAsDataURL(files[0]);
    }
  });
  dialog.open();
};


const process_circuit = async () => {
  has_active_process.value = true;
  is_circuit_processing.value = true;
  try {
    const predict_response = await ofetch(`${useNetworkStore().predict_host}/api/predict/run_prediction`, {
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
    is_circuit_ready_for_processing.value = false;
  } catch {
    toast.add({
      title: "Произошла ошибка при обработке схемы",
      description: "Невозможно обработать запрос",
      color: "red",
      icon: 'lucide:x-circle',
      timeout: 3000
    });
  } finally {
    has_active_process.value = false;
    is_circuit_processing.value = false;
  }
};


const {
  original_width,
  original_height,
  current_viewer,
  computed_viewer,
  context_open,
  virtualElement,
  context_data,
  onContextMenuSafe
} = useCircuitImage(circuit_image)


const unique_class_names = computed(() => {
  const seen = new Set<string>();
  for (const component of recognized_components.value) {
    seen.add(component.class_name);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
});

const class_names_gradient = computed(() => {
  const result: Record<string, number> = {};
  const class_names_count = unique_class_names.value.length;
  for (let i = 0; i < class_names_count; i++) {
    const pos = i / class_names_count;
    const hue = pos * 360;
    result[unique_class_names.value[i]] = hue;
  }
  return result;
});


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

const parameterFields = [
  { key: 'thresh_value', label: 'thresh_value' },
  { key: 'line_length', label: 'line_length' },
  { key: 'min_line_length', label: 'min_line_length' },
  { key: 'max_line_gap', label: 'max_line_gap' },
  { key: 'line_repair_kernel_size', label: 'line_repair_kernel_size' },
  { key: 'dilate_kernel_size', label: 'dilate_kernel_size' },
  { key: 'dilate_iterations', label: 'dilate_iterations' },
  { key: 'erode_kernel_size', label: 'erode_kernel_size' },
  { key: 'erode_iterations', label: 'erode_iterations' },
  { key: 'component_min_area', label: 'component_min_area' },
  { key: 'component_min_width', label: 'component_min_width' },
  { key: 'component_min_height', label: 'component_min_height' },
  { key: 'component_max_area', label: 'component_max_area' },
  { key: 'component_max_width', label: 'component_max_width' },
  { key: 'component_max_height', label: 'component_max_height' },
  { key: 'component_max_side_multiplier', label: 'max_side_multiplier' },
  { key: 'contour_min_width', label: 'contour_min_width' },
  { key: 'contour_min_height', label: 'contour_min_height' },
  { key: 'contour_max_area', label: 'contour_max_area' },
  { key: 'max_pixel_count_to_use_remove_lines_modified', label: 'max_pixel_count_rlm' },
  { key: 'min_multiplier_to_count_as_component_part', label: 'min_mul_to_count_part' },
  { key: 'max_threshold_to_merge_boxes', label: 'max_threshold_merge' },
  { key: 'box_increase_factor', label: 'box_increase_factor' }
]

watchEffect(() => {
  for (const key in parameterLimits) {
    const { min, max } = parameterLimits[key]
    const value = parameters[key]
    if (value < min) parameters[key] = min
    else if (value > max) parameters[key] = max
  }
})


const components_columns = [
  { key: "id", label: "ID", sortable: true },
  { key: "x", label: "X", sortable: true },
  { key: "y", label: "Y", sortable: true },
  { key: "w", label: "W", sortable: true },
  { key: "h", label: "H", sortable: true },
  { key: "class_name", label: "Class name", sortable: true },
  { key: "confidence", label: "Confidence", sortable: true },
];

const components_rows = computed(() => {
  return (recognized_components.value ?? []).map(component => ({
    ...component,
    x: component.x.toFixed(3),
    y: component.y.toFixed(3),
    w: component.w.toFixed(3),
    h: component.h.toFixed(3),
    confidence: component.confidence.toFixed(3),
  }));
});
</script>



<template>
  <client-only>
    <!-- Занимает всю страницу -->
    <div style="display: flex; flex-direction: column; height: 100%; width: 100%">
      <!-- Занимает 95% высоты -->
      <div style="display: flex;flex-direction: row; height: 95%; width: 100%; margin-bottom: 0.5rem;">
        <!-- Контейнер в левой части экрана -->
        <div class="container" style="height: 100%; width: 20%; display: flex; flex-direction: column; overflow: hidden;">
          <p>Параметры поиска компонентов</p>
          <UDivider style="margin-bottom: 0.6rem;" />
          <!-- Контейнер для параметров поиска компонентов -->
          <div style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.47rem; padding-right: 4px; padding-top: 3px">
            <!-- Блоки с параметрами -->
            <div v-for="field in parameterFields" :key="field.key" style="display: flex; flex-direction: row;">
              <p style="width: 200px; margin: 0">{{ field.label }}</p>
              <div style="flex: 1">
                <UInput v-model="parameters[field.key]" type="number" style="height: 28px; padding: 2px 6px; width: 100%"/>
              </div>
            </div>
          </div>
        </div>

        <!-- Контейнер в центральной части экрана -->
        <div class="container" style="height: 100%; width: 40%; overflow: clip">
          <p>Схема</p>
          <UDivider />
          <!-- Контейнер с боксами компонентов -->
          <div :style="computed_viewer" style="position: absolute; z-index: 2016; height: 0; overflow: visible; pointer-events: none; background: none !important;">
            <!-- Боксы распознанных компонентов -->
            <BoundingBox
                v-for="c in recognized_components"
                :key="c.id"
                :x="c.x"
                :y="c.y"
                :w="c.w"
                :h="c.h"
                :background="`hsla(${class_names_gradient[c.class_name]}, 100%, 50%, 0.2)`"
                :border-color="`hsla(${class_names_gradient[c.class_name]}, 100%, 50%, 0.6)`"
                :border-width="1"
                :original-width="original_width"
                :original-height="original_height"
                :context-data="c"
                @contextmenu="onContextMenuSafe"
            />
            <!-- Боксы неизвестных компонентов -->
            <BoundingBox
                v-for="c in unknown_components"
                :key="c.id"
                :x="c.x"
                :y="c.y"
                :w="c.w"
                :h="c.h"
                :background="`rgba(128, 128, 128, 0.2)`"
                :border-color="`rgba(128, 128, 128, 0.6)`"
                :border-width="1"
                :original-width="original_width"
                :original-height="original_height"
                :context-data="c"
                @contextmenu="onContextMenuSafe"
            />
          </div>
          <!-- Контекстное меню по клику на один из боксов -->
          <UContextMenu style="z-index: 2017" v-model="context_open" :virtual-element="virtualElement">
            <VCodeBlock :code="JSON.stringify(context_data)" highlightjs lang="json" :theme="useColorMode().value === 'dark' ? 'neon-bunny' : 'atom-one-light'"/>
          </UContextMenu>
          <!-- Изображение схемы -->
          <NuxtImg
              id="circuit_image_element"
              :src="circuit_image"
              @click="
                (() => {
                  if (current_viewer == null)
                    current_viewer = ViewerApi({ images: [circuit_image] });
                })()
              "
          />
        </div>

        <!-- Контейнер в правой части экрана -->
        <div class="container" style="height: 100%; width: 40%; display: flex; flex-direction: column; overflow: hidden;">
          <p>Найденные копоненты</p>
          <UDivider />
          <!-- Таблица с найденными компонентами -->
          <div style="height: 100%; overflow-y: scroll">
            <UTable
                :columns="components_columns"
                :rows="components_rows"
            />
          </div>
        </div>
      </div>

      <!-- Занимает 5% высоты снизу (для кнопок) -->
      <div style="display: flex; flex-direction: row; gap: 1rem; align-items: center; justify-content: center; height: 5%; width: 100%;">
        <UButton
            label="Загрузить схему"
            :disabled="has_active_process"
            :loading="is_circuit_loading"
            @click="load_circuit"
        />
        <UButton
            label="Обработать схему"
            :class="{ hidden: !is_circuit_ready_for_processing }"
            :disabled="has_active_process"
            :loading="is_circuit_processing"
            @click="process_circuit"
        />
      </div>
    </div>
  </client-only>
</template>

<style scoped>
.container {
  background-color: #a0a0a010;
  border-radius: 1rem;
  padding: 1rem;
  margin: 1rem;
}

.hidden {
  display: none;
}
</style>