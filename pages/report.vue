<script setup lang="ts">
import 'viewerjs/dist/viewer.css'
import {api as ViewerApi, component as Viewer} from 'v-viewer'
import {useNetworkStore} from "~/stores/network";
import {ofetch} from "ofetch";
import VCodeBlock from "@wdns/vue-code-block";


interface Circuit {
  circuit_id: number
  circuit_image: string
}

interface Cluster {
  id: number
  name: string
  label: number
  components: UnknownComponent[]
}

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

interface ReportResponse {
  circuit_id: number
  circuit_image: string
  recognized_components: RecognizedComponent[]
  clusters: Cluster[]
  unclustered_components: UnknownComponent[]
}

interface ClusterComponent {
  id: number
  circuit_id: number
  x: number
  y: number
  w: number
  h: number
  image: string
}

interface ClusterMain {
  id: number
  name: string
  label: number
  components: ClusterComponent[]
}


const toast = useToast();
const has_active_process = ref(false);
const is_report_loading = ref(false);
const is_report_deleting = ref(false);
const are_clusters_loading = ref(false);
const show_choose_report_modal = ref(false);
const show_clusters_modal = ref(false)

const all_circuits = ref<Circuit[]>([]);
const report_circuit_id = ref(null);
const report_circuit_image = ref("");
const report_recognized_components = ref<RecognizedComponent[]>([]);
const report_unclustered_components = ref<UnknownComponent[]>([]);
const report_clusters = ref<Cluster[]>([]);

const clusters = ref<ClusterMain[]>([]);
const unclustered_components = ref<ClusterComponent[]>([]);


const select_circuit = (id) => {
  report_circuit_id.value = id
}

const try_open_choose_report_modal = async () => {
  has_active_process.value = true;
  try {
    const circuits_response = await ofetch(`${useNetworkStore().database_host}/api/db/get_circuits`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
    });

    all_circuits.value = circuits_response.circuits;

    if (all_circuits.value.length === 0) {
      toast.add({
        title: "Нет доступных схем",
        description: "Пожалуйста, загрузите хотя бы одну\nсхему",
        color: "red",
        icon: 'lucide:x-circle',
        timeout: 3000
      });
    } else {
      show_choose_report_modal.value = true;
    }
  } catch {
    toast.add({
      title: "Произошла ошибка при загрузке схем",
      description: "Невозможно обработать запрос",
      color: "red",
      icon: 'lucide:x-circle',
      timeout: 3000
    });
  } finally {
    has_active_process.value = false;
  }
};

const close_choose_report_modal = () => {
  show_choose_report_modal.value = false;
  all_circuits.value = [];
};

const fetch_report = async () => {
  has_active_process.value = true;
  is_report_loading.value = true;
  try {
    close_choose_report_modal();

    const report_response = await ofetch(`${useNetworkStore().database_host}/api/db/get_components_full_by_circuit_id`, {
      method: "GET",
      query: {
        circuit_id: report_circuit_id.value
      },
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
    });

    const formattedResponse = formatReportResponse(report_response);
    report_circuit_image.value = formattedResponse.circuit_image;
    report_recognized_components.value = formattedResponse.recognized_components;
    report_clusters.value = formattedResponse.clusters;
    report_unclustered_components.value = formattedResponse.unclustered_components;
  } catch {
    toast.add({
      title: "Произошла ошибка при загрузке отчета",
      description: "Невозможно обработать запрос",
      color: "red",
      icon: 'lucide:x-circle',
      timeout: 3000
    });
  } finally {
    has_active_process.value = false;
    is_report_loading.value = false;
  }
}

function formatReportResponse(raw: ReportResponse): ReportResponse {
  return {
    circuit_id: raw.circuit_id,
    circuit_image: `data:image/png;base64,${raw.circuit_image}`,
    recognized_components: raw.recognized_components.map((comp) => ({
      ...comp,
      image: `data:image/png;base64,${comp.image}`,
    })),
    clusters: raw.clusters.map((cluster) => ({
      ...cluster,
      components: cluster.components.map((comp) => ({
        ...comp,
        image: `data:image/png;base64,${comp.image}`,
      })),
    })),
    unclustered_components: raw.unclustered_components.map((comp) => ({
      ...comp,
      image: `data:image/png;base64,${comp.image}`,
    })),
  };
}

const download_recognized_component = async (component_id: number) => {
  const component = report_recognized_components.value.find(c => c.id === component_id)
  if (!component || !component.image) {
    return
  }

  const download_link = document.createElement('a')
  download_link.href = component.image
  download_link.download = `recognized_component_${report_circuit_id.value}_${component_id}.png`
  download_link.click()
}

const download_unknown_component = async (component_id: number) => {
  let component = report_unclustered_components.value.find(c => c.id === component_id)
  if (!component) {
    for (const cluster of report_clusters.value) {
      const found = cluster.components.find(c => c.id === component_id)
      if (found) {
        component = found
        break
      }
    }
  }
  if (!component || !component.image) {
    return
  }

  const download_link = document.createElement('a')
  download_link.href = component.image
  download_link.download = `unknown_component_${report_circuit_id.value}_${component_id}.png`
  download_link.click()
}

const delete_report = async () => {
  has_active_process.value = true;
  is_report_deleting.value = true;
  try {
    await ofetch(`${useNetworkStore().database_host}/api/db/delete_components_by_circuit_id`, {
      method: "POST",
      body: {
        circuit_id: report_circuit_id.value
      },
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
    });
    report_circuit_id.value = null;
    report_circuit_image.value = "";
    report_recognized_components.value = [];
    report_unclustered_components.value = [];
    report_clusters.value = [];
  } catch {
    toast.add({
      title: "Произошла ошибка при удалении отчета",
      description: "Невозможно обработать запрос",
      color: "red",
      icon: 'lucide:x-circle',
      timeout: 3000
    });
  } finally {
    has_active_process.value = false;
    is_report_deleting.value = false;
  }
}


const try_open_clusters_modal = async () => {
  has_active_process.value = true;
  are_clusters_loading.value = true;
  try {
    const cluster_response = await ofetch(`${useNetworkStore().cluster_host}/api/cluster/run_clusterization`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
    });

    clusters.value = cluster_response.clusters;
    unclustered_components.value = cluster_response.unclustered_components;

    if (clusters.value.length === 0) {
      toast.add({
        title: "Нет кластеров",
        description: "Пожалуйста, загрузите хотя бы одну\nсхему",
        color: "red",
        icon: 'lucide:x-circle',
        timeout: 3000
      });
    } else {
      show_clusters_modal.value = true;
    }
  } catch {
    toast.add({
      title: "Произошла ошибка при загрузке кластеров",
      description: "Невозможно обработать запрос",
      color: "red",
      icon: 'lucide:x-circle',
      timeout: 3000
    });
  } finally {
    has_active_process.value = false;
    are_clusters_loading.value = false;
  }
};

async function deleteUnknownComponent(componentId: number) {
  has_active_process.value = true;
  try {
    for (const cluster of clusters.value) {
      const index = cluster.components.findIndex(c => c.id === componentId);
      if (index !== -1) {
        cluster.components.splice(index, 1);
        break;
      }
    }

    await ofetch(`${useNetworkStore().database_host}/api/db/delete_unknown_components_by_ids`, {
      method: "POST",
      body: {
        component_ids: [componentId]
      },
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
    });
  } catch {
    toast.add({
      title: "Произошла ошибка при удалении компонента",
      description: "Невозможно обработать запрос",
      color: "red",
      icon: 'lucide:x-circle',
      timeout: 3000
    });
  } finally {
    has_active_process.value = false;
  }
}

async function deleteCluster(clusterId: number) {
  has_active_process.value = true;
  try {
    const index = clusters.value.findIndex(c => c.id === clusterId);
    if (index !== -1) {
      clusters.value.splice(index, 1);
    }

    await ofetch(`${useNetworkStore().database_host}/api/db/delete_unknown_components_by_cluster_ids`, {
      method: "POST",
      body: {
        cluster_ids: [clusterId]
      },
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
    });
  } catch {
    toast.add({
      title: "Произошла ошибка при удалении кластера",
      description: "Невозможно обработать запрос",
      color: "red",
      icon: 'lucide:x-circle',
      timeout: 3000
    });
  } finally {
    has_active_process.value = false;
  }
}


const {
  original_width,
  original_height,
  current_viewer,
  computed_viewer,
  context_open,
  virtualElement,
  context_data,
  onContextMenuSafe
} = useCircuitImage(report_circuit_image)


const unique_class_names = computed(() => {
  const seen = new Set<string>();
  for (const component of report_recognized_components.value) {
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

const unique_cluster_labels = computed(() => {
  const seen = new Set<number>();
  for (const cluster of report_clusters.value) {
    if (cluster.label != -1) {
      seen.add(cluster.label);
    }
  }
  return Array.from(seen).sort((a, b) => a - b);
});

const clusters_gradient = computed(() => {
  const result: Record<number, number> = {};
  const clusters_count = unique_cluster_labels.value.length;
  for (let i = 0; i < clusters_count; i++) {
    const pos = i / clusters_count;
    const hue = pos * 360;
    result[unique_cluster_labels.value[i]] = hue;
  }
  return result;
});


const recognized_components_columns = [
  { key: "id", label: "ID", sortable: true },
  { key: "image", label: "Image", sortable: false },
  { key: "class_name", label: "Class name", sortable: true },
  { key: "action", label: "Action", sortable: false },
];

const recognized_components_rows = computed(() => {
  return report_recognized_components.value
});

const unknown_components_columns = [
  { key: "id", label: "ID", sortable: true },
  { key: "image", label: "Image", sortable: false },
  { key: "cluster", label: "Cluster", sortable: true },
  { key: "action", label: "Action", sortable: false },
];

const unknown_components_rows = computed(() => {
  const clustered = report_clusters.value
      .flatMap(cluster =>
          cluster.components.map(component => ({
            ...component,
            cluster: cluster.label,
          }))
      );

  const unclustered = report_unclustered_components.value.map(component => ({
    ...component,
    cluster: null,
  }));

  return [...unclustered, ...clustered];
});
</script>



<template>
  <client-only>
    <!-- Занимает всю страницу -->
    <div style="display: flex; flex-direction: column; height: 100%; width: 100%">
      <!-- Занимает 90% высоты -->
      <div style="display: flex; flex-direction: row; height: 90%; width: 100%; margin-bottom: 0.5rem">
        <!-- Контейнер в левой части экрана -->
        <div class="container" style="height: 100%; width: 60%; overflow: clip">
          <p>Схема</p>
          <UDivider/>
          <!-- Контейнер с боксами компонентов -->
          <div :style="computed_viewer" style="position: absolute; z-index: 2016; height: 0; overflow: visible; pointer-events: none; background: none !important;">
            <!-- Боксы распознанных компонентов -->
            <BoundingBox
                v-for="c in report_recognized_components"
                :key="c.id"
                :x="c.x"
                :y="c.y"
                :w="c.w"
                :h="c.h"
                :background="`hsla(${class_names_gradient[c.class_name]}, 100%, 50%, 0.1)`"
                :border-color="`hsla(${class_names_gradient[c.class_name]}, 100%, 50%, 0.9)`"
                :border-width="5"
                :original-width="original_width"
                :original-height="original_height"
                :context-data="c"
                @contextmenu="onContextMenuSafe"
            />
            <!-- Боксы компонентов обычных кластеров -->
            <div v-for="cluster in report_clusters.filter(c => c.label !== -1)" :key="cluster.id">
              <BoundingBox
                  v-for="c in cluster.components"
                  :key="c.id"
                  :x="c.x"
                  :y="c.y"
                  :w="c.w"
                  :h="c.h"
                  :background="`hsla(${clusters_gradient[cluster.label]}, 100%, 50%, 0.2)`"
                  :border-color="`hsla(${clusters_gradient[cluster.label]}, 100%, 50%, 0.2)`"
                  :border-width="0"
                  :original-width="original_width"
                  :original-height="original_height"
                  :context-data="c"
                  @contextmenu="onContextMenuSafe"
              />
            </div>
            <!-- Боксы компонентов кластера -1 -->
            <div v-for="cluster in report_clusters.filter(c => c.label === -1)" :key="cluster.id">
              <BoundingBox
                  v-for="c in cluster.components"
                  :key="c.id"
                  :x="c.x"
                  :y="c.y"
                  :w="c.w"
                  :h="c.h"
                  :background="`rgba(160, 160, 160, 0.2)`"
                  :border-color="`rgba(160, 160, 160, 0.6)`"
                  :border-width="0"
                  :original-width="original_width"
                  :original-height="original_height"
                  :context-data="c"
                  @contextmenu="onContextMenuSafe"
              />
            </div>
            <!-- Боксы некластеризованных компонентов -->
            <BoundingBox
                v-for="c in report_unclustered_components"
                :key="c.id"
                :x="c.x"
                :y="c.y"
                :w="c.w"
                :h="c.h"
                :background="`rgba(60, 60, 60, 0.2)`"
                :border-color="`rgba(60, 60, 60, 0.6)`"
                :border-width="0"
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
              :src="report_circuit_image"
              @click="
                (() => {
                  if (current_viewer == null)
                    current_viewer = ViewerApi({ images: [report_circuit_image] });
                })()
              "
          />
        </div>

        <!-- Контейнер в правой части экрана -->
        <div class="container" style="height: 100%; width: 40%; display: flex; flex-direction: column; overflow: hidden;">
          <p>Распознанные копоненты</p>
          <UDivider />
          <!-- Таблица с распознанными компонентами -->
          <div style="height: 100%; overflow-y: scroll">
            <UTable
                :columns="recognized_components_columns"
                :rows="recognized_components_rows">
              <template #image-data="{row}">
                <NuxtImg :src="row.image"></NuxtImg>
              </template>
              <template #action-data="{row}">
                <UButton label="Скачать" @click="download_recognized_component(row.id)"/>
              </template>
            </UTable>
          </div>
          <p>Неизвестные копоненты</p>
          <UDivider />
          <!-- Таблица с неизвестными компонентами -->
          <div style="height: 100%; overflow-y: scroll">
            <UTable
                :columns="unknown_components_columns"
                :rows="unknown_components_rows">
              <template #image-data="{row}">
                <NuxtImg :src="row.image"></NuxtImg>
              </template>
              <template #action-data="{row}">
                <UButton label="Download" @click="download_unknown_component(row.id)"/>
              </template>
            </UTable>
          </div>
        </div>
      </div>

      <!-- Занимает 10% высоты снизу (для кнопок) -->
      <div style="display: flex; flex-direction: row; gap: 1rem; align-items: center; justify-content: center; height: 10%; width: 100%">
        <UButton
            label="Получить кластеры"
            :disabled="has_active_process"
            :loading="are_clusters_loading"
            @click="try_open_clusters_modal"/>
        <UButton
            label="Получить отчет"
            :disabled="has_active_process"
            :loading="is_report_loading"
            @click="try_open_choose_report_modal"/>
        <UButton
            label="Удалить отчет"
            :class="{ hidden: report_circuit_image === '' }"
            :disabled="has_active_process"
            :loading="is_report_deleting"
            @click="delete_report"/>
      </div>
    </div>

    <!-- Модальное окно для выбора схемы для отчета -->
    <UModal v-model="show_choose_report_modal" :ui="{width: 'sm:max-w-[80vw]'}" style="z-index: 3000">
      <UCard>
        <template #header>
          <h2>Выберите схему для отчета</h2>
        </template>

        <div style="display: flex; flex-wrap: wrap; gap: 1rem">
          <div
              v-for="circuit in all_circuits"
              :key="circuit.circuit_id"
              @click="select_circuit(circuit.circuit_id)"
              @dblclick="fetch_report"
              :class="['cursor-pointer border p-2 rounded', report_circuit_id === circuit.circuit_id ? 'border-blue-500' : 'border-gray-300']"
          >
            <img :src="'data:image/png;base64,' + circuit.circuit_image" height="1000" />
          </div>
          <UDivider/>
        </div>
      </UCard>
    </UModal>

    <!-- Модальное окно для показа кластеров -->
    <UModal v-model="show_clusters_modal" :ui="{width: 'sm:max-w-[80vw]'}" style="z-index: 3000">
      <UCard>
        <template #header>
          <p style="font-weight: bold; font-size: 1.25rem; margin: 0;">
            Кластеры
          </p>
        </template>
        <div v-for="cluster in clusters.slice().sort((a, b) => a.label - b.label)" :key="cluster.id">
          <div style="display: flex; align-items: center;">
            <p style="font-weight: bold; font-size: 1.25rem; margin: 0;">
              {{ cluster.name }}
            </p>
            <UButton
                icon="i-heroicons-x-mark"
                color="red"
                size="xs"
                variant="solid"
                style="margin-left: 20px"
                @click="deleteCluster(cluster.id)"
            />
          </div>
          <UDivider />
          <Viewer :images="cluster.components.map(c => `data:image/png;base64,${c.image}`)">
            <div style="display: flex; flex-direction: row; gap: 0.5rem; flex-wrap: wrap">
              <div
                  v-for="component in cluster.components"
                  :key="component.id"
                  style="position: relative; width: 150px; height: 150px;"
              >
                <img
                    :src="`data:image/png;base64,${component.image}`"
                    style="width: 100%; height: 100%; object-fit: contain; border-radius: 0.25rem;"
                />
                <UButton
                    icon="i-heroicons-x-mark"
                    color="red"
                    size="2xs"
                    variant="solid"
                    square
                    @click="deleteUnknownComponent(component.id)"
                    style="position: absolute; top: 0px; right: 0px; z-index: 10;"
                />
              </div>
            </div>
          </Viewer>
          <UDivider style="margin-bottom: 30px"/>
        </div>
      </UCard>
    </UModal>
  </client-only>
</template>

<style scoped>
.container {
  background-color: #A0A0A010;
  border-radius: 1rem;
  padding: 1rem;
  margin: 1rem;
}

.hidden {
  display: none;
}
</style>